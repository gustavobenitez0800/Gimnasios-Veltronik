// ============================================
// VELTRONIK - LA COLA DE ACCESOS SIN INTERNET
// ============================================
// El mostrador tiene que poder registrar entradas con el cable desenchufado. Lo que se
// registra sin conexión se guarda acá y se manda cuando vuelve.
//
// ─── LAS TRES REGLAS QUE HACEN QUE ESTO SEA CORRECTO Y NO UN DESASTRE ───
//
// Registrar un acceso NO es "grabar una entrada": el servidor deduce si es entrada o
// salida mirando el estado del socio. Eso hace que una cola ingenua sea peligrosa —un
// reintento no duplica, INVIERTE: el socio queda "afuera" sin haberse ido—. Tres reglas
// lo vuelven seguro:
//
//   1. CADA ACCESO LLEVA UN SELLO propio (`clientRef`, un UUID). El servidor lo guarda con
//      un índice único: si el mismo acceso llega dos veces, devuelve el que ya tenía y no
//      hace nada. Reintentar deja de tener consecuencias.
//
//   2. CADA ACCESO LLEVA LA HORA EN QUE PASÓ (`ocurridoEn`). El servidor decide la
//      dirección contra ESE momento, no contra el momento en que llegó. Un acceso de las
//      10:00 que llega 10:45 se lee con el mundo de las 10:00.
//
//   3. SE VACÍA EN ORDEN ESTRICTO, DE A UNO. Si el socio entró a las 10 y salió a las 11,
//      mandarlos al revés invierte las dos marcas. Un candado impide que dos vaciados
//      corran a la vez (el temporizador cruzándose con el evento de reconexión, o la app
//      reabriéndose mientras la anterior todavía manda).
//
// Con las tres, reproducir la cola da EXACTAMENTE el mismo resultado que si hubiera
// habido internet. Esa es la propiedad que se defiende acá.
//
// ⚠️ NO SE BORRA UN ACCESO QUE FALLÓ POR RED. Solo sale de la cola cuando el servidor
// confirmó, o cuando lo rechazó por algo que no se arregla reintentando. Un error de red
// se reintenta indefinidamente: perder una visita es perderle datos al gimnasio.

const DB = 'veltronik-local';
const STORE = 'cola-accesos';
const VERSION = 2; // la 1 la creó localMembers con su propio almacén

/** Tope de la cola. Un mostrador hace decenas de accesos por día; 5000 son semanas. */
const MAX_EN_COLA = 5000;

/** Cuántos intentos fallidos antes de considerar que algo anda mal de verdad. */
const AVISAR_TRAS_INTENTOS = 5;

let candado = false;

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // `members` puede existir ya (localMembers). Se crea solo lo que falte.
      if (!db.objectStoreNames.contains('members')) db.createObjectStore('members');
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath = el sello. Encolar dos veces el mismo acceso lo pisa, no lo duplica.
        const store = db.createObjectStore(STORE, { keyPath: 'clientRef' });
        // Se lee SIEMPRE por orden de ocurrencia: es la regla 3.
        store.createIndex('porMomento', 'ocurridoEn');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const pedir = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function conStore(modo, fn) {
  const db = await abrirDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, modo);
      const store = tx.objectStore(STORE);
      let resultado;
      Promise.resolve(fn(store)).then((r) => { resultado = r; }).catch(reject);
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Guarda un acceso para mandarlo cuando haya internet. Devuelve el sello. */
export async function encolar({ memberId, method, memberName, ocurridoEn, tenantId }) {
  const item = {
    clientRef: crypto.randomUUID(),
    // DE QUÉ GIMNASIO es este acceso.
    //
    // Sin esto, un acceso que quedó esperando y otra sucursal que inicia sesión en la
    // misma máquina terminan mal: el pedido saldría con el gimnasio ACTUAL en la cabecera
    // y la visita se escribiría en el negocio equivocado. La cola es de la máquina, pero
    // cada acceso es de un gimnasio.
    tenantId: tenantId || localStorage.getItem('current_org_id') || null,
    memberId,
    method: method || 'manual',
    memberName: memberName || '',
    // Hora local del terminal. El servidor la acota si el reloj está roto.
    ocurridoEn: ocurridoEn || new Date().toISOString(),
    intentos: 0,
    ultimoError: null,
  };
  await conStore('readwrite', async (store) => {
    const cuantos = await pedir(store.count());
    if (cuantos >= MAX_EN_COLA) {
      // Se descarta el MÁS VIEJO, no el nuevo: si algo hay que perder, que sea lo que ya
      // es historia y no la persona parada en la puerta ahora.
      const cursor = await pedir(store.index('porMomento').openCursor());
      if (cursor) await pedir(store.delete(cursor.primaryKey));
    }
    await pedir(store.put(item));
  });
  return item.clientRef;
}

/**
 * Los accesos pendientes DE ESTE GIMNASIO, en el orden en que ocurrieron.
 *
 * <p>Los de otra sucursal se quedan esperando a que esa sucursal vuelva a entrar. No se
 * borran —son visitas reales— y no se mandan con el gimnasio equivocado.</p>
 */
export async function pendientes(tenantId = localStorage.getItem('current_org_id')) {
  const todos = await conStore('readonly', (store) => pedir(store.index('porMomento').getAll()));
  if (!tenantId) return todos;
  return todos.filter((i) => !i.tenantId || i.tenantId === tenantId);
}

/** Cuántos esperan. Para que la pantalla lo pueda decir. */
export async function cuantosPendientes(tenantId) {
  try {
    return (await pendientes(tenantId)).length;
  } catch {
    return 0;
  }
}

async function sacar(clientRef) {
  await conStore('readwrite', (store) => pedir(store.delete(clientRef)));
}

async function anotarFallo(item, error) {
  await conStore('readwrite', (store) => pedir(store.put({
    ...item,
    intentos: (item.intentos || 0) + 1,
    ultimoError: String(error?.message || error || '').slice(0, 200),
  })));
}

/**
 * ¿Este error dice "no insistas"?
 *
 * Un 4xx es el servidor entendiendo el pedido y rechazándolo: el socio no existe, el
 * cuerpo está mal. Reintentar no lo va a cambiar y trabaría la cola para siempre detrás
 * de un acceso imposible. Se exceptúan 408 y 429, que sí son "probá de nuevo", y 401/403,
 * que se arreglan solos cuando la sesión se renueva.
 */
function esDefinitivo(status) {
  if (!status || status < 400 || status >= 500) return false;
  return ![408, 429, 401, 403].includes(status);
}

/**
 * Manda lo que haya, en orden y de a uno.
 *
 * @param enviar función que manda UN acceso. Debe rechazar con un error que traiga
 *               `response.status` cuando el servidor haya contestado.
 */
export async function vaciar(enviar, tenantId = localStorage.getItem('current_org_id')) {
  // Regla 3: un solo vaciado a la vez. Sin esto, dos tandas en paralelo pueden mandar la
  // salida antes que la entrada y dejar al socio invertido.
  if (candado) return { enviados: 0, quedan: await cuantosPendientes(tenantId), descartados: 0 };
  candado = true;
  let enviados = 0;
  let descartados = 0;
  try {
    const lista = await pendientes(tenantId);
    for (const item of lista) {
      try {
        await enviar(item);
        await sacar(item.clientRef);
        enviados++;
      } catch (error) {
        if (esDefinitivo(error?.response?.status)) {
          await sacar(item.clientRef);
          descartados++;
          continue;
        }
        // Error de red o del servidor: se anota y se CORTA la tanda. Seguir con el
        // siguiente rompería el orden, que es lo único que sostiene la corrección.
        await anotarFallo(item, error);
        break;
      }
    }
  } finally {
    candado = false;
  }
  return { enviados, quedan: await cuantosPendientes(tenantId), descartados };
}

/** ¿Hay algo que viene fallando hace rato? La pantalla lo usa para avisar de verdad. */
export async function hayProblema(tenantId) {
  try {
    const lista = await pendientes(tenantId);
    return lista.some((i) => (i.intentos || 0) >= AVISAR_TRAS_INTENTOS);
  } catch {
    return false;
  }
}

/**
 * Vacía la cola entera. NO se usa al cerrar sesión.
 *
 * <p>Cerrar sesión no puede borrar accesos: son visitas que pasaron de verdad y que el
 * gimnasio todavía no tiene. Se quedan esperando —marcadas con su gimnasio— y salen
 * cuando alguien de esa sucursal vuelva a entrar. Esto existe para los tests y para un
 * borrado deliberado.</p>
 */
export async function olvidarCola() {
  try {
    await conStore('readwrite', (store) => pedir(store.clear()));
  } catch {
    // Si no se pudo, se manda igual en el próximo arranque. No vale interrumpir un
    // cierre de sesión por esto.
  }
}
