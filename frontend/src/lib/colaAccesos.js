// ============================================
// VELTRONIK - LA COLA DE ACCESOS SIN INTERNET
// ============================================
// El mostrador tiene que poder registrar entradas con el cable desenchufado. Lo que se
// registra sin conexión se guarda en el núcleo local y se manda cuando vuelve.
//
// ─── LAS TRES REGLAS QUE HACEN QUE ESTO SEA CORRECTO Y NO UN DESASTRE ───
//
// Registrar un acceso NO es "grabar una entrada": el servidor deduce si es entrada o
// salida mirando el estado del socio. Eso hace que una cola ingenua sea peligrosa —un
// reintento no duplica, INVIERTE: el socio queda "afuera" sin haberse ido—. Tres reglas
// lo vuelven seguro:
//
//   1. CADA ACCESO LLEVA UN SELLO propio (`clientRef`, un UUID). El servidor lo guarda con
//      un índice único (V54, ya en producción): si el mismo acceso llega dos veces,
//      devuelve el que ya tenía y no hace nada. Reintentar deja de tener consecuencias.
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
//
// ⚠️ SOLO EN EL ESCRITORIO. El portal web no promete funcionar sin internet, y una cola en
// una pestaña que se cierra prometería algo que no puede cumplir. Ahí `disponible()` da
// false y el mostrador avisa que no se registró, que es la verdad.

/** El puente al núcleo local, si esta app lo tiene. */
function nucleo() {
  return (typeof window !== 'undefined' && window.electronAPI?.nucleo?.cola) || null;
}

/** ¿Esta app puede guardar accesos para después? */
export function disponible() {
  return nucleo() !== null;
}

/**
 * Cuántas veces SEGUIDAS tiene que rechazar el servidor al de adelante para dar la cola por
 * trabada.
 *
 * <p>Una no alcanza: durante un despliegue el servidor contesta 502 o 503 un momento, y eso se
 * arregla solo. Tres rechazos seguidos son más de diez minutos (el vaciado corre cada cinco)
 * contestando que no, con el servidor del otro lado: eso ya no es un parpadeo.</p>
 */
export const RECHAZOS_PARA_DARLA_POR_TRABADA = 3;

/**
 * ⭐ CÓMO SE ANOTA UN FALLO: con el código adelante si el servidor llegó a contestar.
 *
 * <p><b>Es lo único que distingue "no hay internet" de "el servidor lo rechaza"</b>, y la
 * cola no lo guardaba: anotaba el mensaje a secas. Por eso la pantalla solo sabía decir "se
 * mandan al volver internet", y un gimnasio con la conexión perfecta estuvo 36 horas
 * creyéndole —llamó al del router— mientras el servidor rechazaba la misma alta 288 veces
 * (Santo Sport, 05/10/2026).</p>
 *
 * <p>Forma: {@code HTTP 500 x3 · el mensaje}. El {@code x3} son los rechazos SEGUIDOS: un
 * corte de red en el medio lo vuelve a cero, porque ahí el servidor dejó de ser quien dice
 * que no. Va en el texto y no en una columna para no migrar la base del terminal por un
 * número.</p>
 */
function describirFallo(error, anotadoAntes) {
  const status = error?.response?.status;
  const texto = String(error?.response?.data?.message || error?.message || error || '');
  if (!status) return texto;

  const seguidos = (rechazoAnotado(anotadoAntes)?.seguidos || 0) + 1;
  return `HTTP ${status} x${seguidos} · ${texto}`;
}

/**
 * Lo que dice una anotación de fallo, si fue el servidor el que contestó.
 * @returns {{status: number, seguidos: number} | null} null si fue la red (o no hay nada).
 */
export function rechazoAnotado(ultimoError) {
  const m = /^HTTP (\d{3}) x(\d+)\b/.exec(String(ultimoError || ''));
  return m ? { status: Number(m[1]), seguidos: Number(m[2]) } : null;
}

/**
 * ¿La cola está trabada por el SERVIDOR? Mira al de adelante, que es el que decide: la cola
 * sube en orden y se corta en el primero que falla.
 *
 * <p>Un 402 no cuenta: es el gimnasio bloqueado por falta de pago, que ya tiene su propio
 * cartel y se destraba pagando. Decirle "es un problema nuestro" sería mentirle al revés.</p>
 *
 * @returns {{tipo: string, status: number, intentos: number, error: string} | null}
 */
function comoEstaTrabada(primero) {
  const rechazo = rechazoAnotado(primero?.ultimoError);
  if (!rechazo || rechazo.status === 402) return null;
  if (rechazo.seguidos < RECHAZOS_PARA_DARLA_POR_TRABADA) return null;
  return {
    tipo: primero.tipo || 'ACCESO',
    status: rechazo.status,
    intentos: primero.intentos || rechazo.seguidos,
    error: String(primero.ultimoError).slice(0, 200),
  };
}

/**
 * Regla 3: un solo vaciado a la vez.
 *
 * Vive en el módulo y no en el proceso principal a propósito: el escritorio tiene UNA
 * ventana, así que este candado cubre el caso real (el temporizador cruzándose con el
 * evento de reconexión). Si la pantalla se recarga en medio de un vaciado el candado se
 * pierde, y ahí la garantía la da el `clientRef`: la que sostiene la corrección es la
 * idempotencia del servidor, no este booleano.
 */
let candado = false;

const orgActual = () => {
  try {
    return localStorage.getItem('current_org_id');
  } catch {
    return null;
  }
};

/**
 * Guarda un acceso para mandarlo cuando haya internet. Devuelve el sello, o null si esta
 * app no tiene dónde guardarlo.
 */
export async function encolar({ memberId, method, memberName, ocurridoEn, tenantId, clientRef }) {
  const c = nucleo();
  if (!c || !memberId) return null;

  const item = {
    // Qué es esto. La cola es una sola y guarda de todo —accesos, cobros, altas, egresos,
    // cierres—; el tipo es lo que decide a qué endpoint va al vaciarse. Ver cola.cjs.
    tipo: 'ACCESO',
    // El sello puede venir de afuera: cuando el mostrador intentó mandarlo online y no
    // llegó respuesta, se encola CON EL MISMO sello con el que salió. Si el servidor
    // llegó a guardarlo, el índice único lo reconoce y no lo procesa dos veces. Sin esto,
    // un pedido que se perdió en el camino de vuelta se convertiría en dos accesos — y
    // dos accesos del mismo socio no duplican: INVIERTEN.
    clientRef: clientRef || nuevoSello(),
    // DE QUÉ GIMNASIO es este acceso.
    //
    // Sin esto, un acceso que quedó esperando y otra sucursal que inicia sesión en la
    // misma máquina terminan mal: el pedido saldría con el gimnasio ACTUAL en la cabecera
    // y la visita se escribiría en el negocio equivocado. La cola es de la máquina, pero
    // cada acceso es de un gimnasio.
    tenantId: tenantId || orgActual(),
    memberId,
    method: method || 'manual',
    memberName: memberName || '',
    // Hora local del terminal. El servidor la acota si el reloj está roto (ver
    // ATRASO_MAXIMO_HORAS en AccessLogService): el acceso PASÓ, así que se acota en vez de
    // rechazarse.
    ocurridoEn: ocurridoEn || momentoLocal(),
  };

  try {
    const r = await c.encolar(item);
    if (r?.ok) return item.clientRef;
    // Por el mismo motivo que en `encolarPendiente`: sin esto, un rechazo de la cola se
    // convierte en un "Network Error" que no explica nada.
    console.warn('[Veltronik] No se pudo encolar el acceso:', r?.motivo || 'sin motivo');
    return null;
  } catch (e) {
    console.warn('[Veltronik] Falló el encolado del acceso:', e?.message || e);
    return null;
  }
}

/**
 * Encola cualquier cosa: un cobro, un alta, un egreso, un cierre.
 *
 * <p>Es el hermano genérico de `encolar`, que sabe de accesos y les completa lo suyo. Todo lo
 * demás pasa por acá: el que llama arma el ítem entero porque cada tipo tiene su forma, y esta
 * función solo se ocupa de lo que es igual para todos — que haya sucursal y que haya momento.</p>
 *
 * <p><b>El sello y el momento se ponen si faltan, no se pisan.</b> Cuando el mostrador intentó
 * mandar algo online y no llegó respuesta, se encola CON EL MISMO sello con el que salió: si el
 * servidor llegó a guardarlo, lo reconoce y no lo procesa dos veces. Para un cobro eso no es
 * una fila de más — es un mes regalado.</p>
 *
 * @param {object} item `{tipo, ...lo propio del tipo}`
 * @returns {Promise<string|null>} el sello, o null si no hay dónde guardarlo
 */
export async function encolarPendiente(item) {
  const c = nucleo();
  if (!c || !item?.tipo) return null;

  const completo = {
    ...item,
    clientRef: item.clientRef || nuevoSello(),
    tenantId: item.tenantId || orgActual(),
    ocurridoEn: item.ocurridoEn || momentoLocal(),
  };

  try {
    const r = await c.encolar(completo);
    if (r?.ok) return completo.clientRef;

    // ⚠️ SE AVISA POR QUÉ, Y NO ES UN DETALLE DE PROLIJIDAD.
    //
    // Devolver null a secas hace que quien llama caiga al pedido de red, falle, y muestre
    // "Network Error" — un cartel que no tiene NADA que ver con el motivo real. Pasó de
    // verdad con la primera alta sin conexión: el proceso principal de Electron todavía
    // tenía la cola vieja (Ctrl+R recarga la pantalla pero NO el proceso principal), esa
    // versión exigía `memberId`, y un alta no tiene. Rechazaba en silencio.
    //
    // El motivo lo sabe la cola. Que llegue hasta acá es la diferencia entre diez minutos y
    // una tarde.
    console.warn('[Veltronik] No se pudo encolar:', r?.motivo || 'sin motivo', completo.tipo);
    return null;
  } catch (e) {
    console.warn('[Veltronik] Falló el encolado:', e?.message || e);
    return null;
  }
}

/**
 * ⭐ EL MOMENTO, EN LA HORA DEL MOSTRADOR Y SIN ZONA.
 *
 * <p><b>Acá NO va `toISOString()`, y la diferencia da tres horas.</b> Del otro lado
 * `ocurridoEn` es un `LocalDateTime` de Java: una fecha y una hora SIN zona, leída en la del
 * negocio (Argentina). `toISOString()` devuelve UTC con una "Z" al final, así que el servidor
 * leería las 22:42 donde el reloj del mostrador marcaba las 19:42 — tres horas en el FUTURO.
 * Y como el servidor acota el futuro a "ahora", el acceso perdería exactamente la propiedad
 * por la que este campo existe: haber quedado guardado con el momento en que pasó de verdad.</p>
 *
 * <p>Formato `YYYY-MM-DDTHH:mm:ss`, que es lo que `LocalDateTime` parsea sin ayuda.</p>
 */
export function momentoLocal(fecha = new Date()) {
  const dd = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dd(fecha.getMonth() + 1)}-${dd(fecha.getDate())}`
    + `T${dd(fecha.getHours())}:${dd(fecha.getMinutes())}:${dd(fecha.getSeconds())}`;
}

/** UUID v4, con respaldo para contextos sin `crypto.randomUUID`. */
export function nuevoSello() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Los accesos pendientes DE ESTE GIMNASIO, en el orden en que ocurrieron.
 *
 * <p>Los de otra sucursal se quedan esperando a que esa sucursal vuelva a entrar. No se
 * borran —son visitas reales— y no se mandan con el gimnasio equivocado.</p>
 */
export async function pendientes(tenantId = orgActual()) {
  const c = nucleo();
  if (!c) return [];
  try {
    return (await c.pendientes(tenantId)) || [];
  } catch {
    return [];
  }
}

/**
 * Cuántos esperan y DESDE CUÁNDO, para poder avisar antes de que sea tarde.
 *
 * <p><b>El número solo no alcanza.</b> "3 pendientes" pueden ser de hace dos minutos —el
 * vaciado está por correr— o de hace tres semanas, que significa que el gimnasio viene
 * guardando visitas en un solo disco desde hace tres semanas y nadie se enteró. El diseño
 * permite acumular 30 días; sin la antigüedad, esos 30 días pasan en silencio.</p>
 *
 * <p><b>⭐ Y POR QUÉ no suben, cuando no es la conexión.</b> `trabada` viene con datos solo si
 * el servidor viene rechazando al de adelante (ver {@link comoEstaTrabada}). Es lo que le
 * permite a la pantalla dejar de culpar al internet y al terminal avisarnos.</p>
 *
 * @returns {Promise<{cuantos: number, dias: number, desde: string|null, trabada: object|null}>}
 *          `dias` es la edad de lo más viejo y `desde` su momento (hora local, sin zona).
 */
export async function resumenDeCola(tenantId = orgActual()) {
  const c = nucleo();
  if (!c?.resumen) return { cuantos: 0, dias: 0, desde: null, trabada: null };
  try {
    const { cuantos = 0, masViejo = null, primero = null } = (await c.resumen(tenantId)) || {};
    const trabada = cuantos ? comoEstaTrabada(primero) : null;
    if (!cuantos || !masViejo) return { cuantos, dias: 0, desde: null, trabada };

    // `masViejo` viene sin zona (`YYYY-MM-DDTHH:mm:ss`), que es hora LOCAL del terminal.
    // `new Date()` sobre eso la interpreta como local, que es exactamente lo que corresponde:
    // el reloj con el que se anotó es el mismo con el que se mide.
    const cuando = new Date(masViejo).getTime();
    if (!Number.isFinite(cuando)) return { cuantos, dias: 0, desde: null, trabada };

    const dias = Math.floor((Date.now() - cuando) / (24 * 60 * 60 * 1000));
    return { cuantos, dias: Math.max(0, dias), desde: masViejo, trabada };
  } catch {
    return { cuantos: 0, dias: 0, desde: null, trabada: null };
  }
}

/**
 * ⭐ ¿ESTE SOCIO TIENE UN COBRO ESPERANDO EN LA COLA?
 *
 * <p><b>Por qué hace falta, y por qué no se arregla de otra manera.</b> Cobrar corre el
 * vencimiento del socio, pero eso lo hace el SERVIDOR. Sin internet el cobro queda en la cola y
 * la copia local sigue diciendo lo que decía antes: el socio paga en efectivo, camina hasta la
 * puerta, y la pantalla lo trata de vencido.</p>
 *
 * <p>La tentación es correrle la fecha en el espejo. <b>Eso sería una segunda cuenta de la
 * misma cobertura</b>, que es exactamente el error que este proyecto ya cometió con las fechas
 * y que costó tres bugs. Acá no se recalcula nada: se pregunta a la cola si hay un cobro de ese
 * socio sin subir, y la pantalla lo dice. El veredicto sigue siendo el del servidor —viejo,
 * pero de una sola fuente— y al lado se aclara por qué.</p>
 *
 * @returns {Promise<boolean>}
 */
export async function sociosConCobroPendiente(tenantId = orgActual()) {
  if (!disponible()) return [];
  try {
    const lista = await pendientes(tenantId);
    return lista
      .filter((i) => i.tipo === 'COBRO')
      // El cobro viaja con el nombre que espera el backend (`member_id`), no en camelCase.
      .map((i) => String(i.member_id || i.memberId || ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * ⭐ LOS COBROS QUE TODAVÍA NO SUBIERON, con la forma de la lista del cierre.
 *
 * <p><b>Por qué la pantalla de Caja los necesita.</b> La lista de cobros del período la arma
 * el servidor, así que sin internet llega vacía — y quien está por cerrar leería "0 cobros"
 * el mismo día que cobró cinco cuotas en efectivo. Es el mismo agujero que ya se tapó con los
 * movimientos de caja, entrando por la puerta de al lado.</p>
 *
 * <p>Van marcados (`sinSubir`): la pantalla los dibuja igual, aclarando que están esperando.</p>
 */
export async function cobrosPendientes(tenantId = orgActual()) {
  if (!disponible()) return [];
  try {
    const lista = await pendientes(tenantId);
    return lista
      .filter((i) => i.tipo === 'COBRO')
      .map((i) => ({
        // El sello ES el id que va a tener del otro lado: el backend lo guarda como
        // `client_ref` y de ahí sale la fila. Usarlo acá evita que salte de identidad al subir.
        id: i.clientRef,
        // Si el cobro se encoló desde una versión anterior no trae el nombre. Se dice, en vez
        // de dejar el renglón sin nada: quien cierra tiene que poder contar los renglones.
        socio: i.memberName || 'Cobro sin subir',
        monto: Number(i.amount) || 0,
        // El backend lo manda en minúsculas y la pantalla compara así.
        metodo: String(i.paymentMethod || 'cash').toLowerCase(),
        fecha: i.paymentDate || i.ocurridoEn,
        sinSubir: true,
      }));
  } catch {
    return [];
  }
}

/**
 * ⭐ LAS ALTAS QUE TODAVÍA NO SUBIERON.
 *
 * <p><b>Por qué la copia local las necesita.</b> El espejo se reemplaza ENTERO en cada refresco
 * —es lo que evita que un socio dado de baja se quede para siempre—, así que un socio creado
 * sin conexión desaparecería en el primer refresco, antes de que su alta llegue al servidor.
 * Quien atiende lo daría de alta y no lo podría buscar para cobrarle, que es literalmente el
 * paso siguiente.</p>
 *
 * <p>La cola es la fuente: mientras el alta esté acá, ese socio se vuelve a poner en el espejo
 * después de cada reemplazo. Cuando sube, sale de la cola y ya viene del servidor.</p>
 */
export async function altasPendientes(tenantId = orgActual()) {
  if (!disponible()) return [];
  try {
    const lista = await pendientes(tenantId);
    return lista.filter((i) => i.tipo === 'ALTA');
  } catch {
    return [];
  }
}

/**
 * ⭐ LOS MOVIMIENTOS DE CAJA QUE TODAVÍA NO SUBIERON.
 *
 * <p><b>Por qué la pantalla de Caja los necesita a la vista.</b> La lista de movimientos la
 * arma el servidor, así que sin internet aparece vacía — y ese vacío es peligroso de una forma
 * concreta: quien atendió anota que le pagó $15.000 a la limpieza, mira la lista, no lo ve, y
 * <b>lo carga de nuevo</b>. Ahora el arqueo espera $15.000 que sí salieron pero contados dos
 * veces, y el cierre acusa un faltante inventado. Es exactamente el error que el módulo de
 * movimientos existe para evitar, entrando por la puerta de al lado.</p>
 *
 * <p>Se devuelven con la misma forma que los del servidor, más una marca: la pantalla los
 * dibuja igual, aclarando que están esperando para subir.</p>
 */
export async function movimientosPendientes(tenantId = orgActual()) {
  if (!disponible()) return [];
  try {
    const lista = await pendientes(tenantId);
    return lista
      .filter((i) => i.tipo === 'EGRESO')
      .map((i) => ({
        // El sello ES el id que va a tener del otro lado: el backend lo guarda como
        // `client_ref` y de él sale la fila. Usarlo acá evita que la fila salte de identidad
        // cuando sube.
        id: i.clientRef,
        // ⚠️ `tipo` está tomado por el tipo de la COLA. El del movimiento (INGRESO/EGRESO)
        // viaja aparte para no pisarlo.
        tipo: i.movimientoTipo || 'EGRESO',
        categoria: i.categoria,
        detalle: i.detalle,
        monto: Number(i.monto) || 0,
        metodo: i.metodo || 'CASH',
        fecha: i.ocurridoEn,
        hechoPorNombre: i.hechoPor || null,
        anuladoAt: null,
        // La marca que hace honesta a la pantalla: esto todavía no está en el servidor.
        sinSubir: true,
      }));
  } catch {
    return [];
  }
}

/** Cuántos esperan. Para que la pantalla lo pueda decir. */
export async function cuantosPendientes(tenantId = orgActual()) {
  const c = nucleo();
  if (!c) return 0;
  try {
    return (await c.contar(tenantId)) || 0;
  } catch {
    return 0;
  }
}

/**
 * ¿Este error dice "no insistas"?
 *
 * Un 4xx es el servidor entendiendo el pedido y rechazándolo: el socio no existe, el
 * cuerpo está mal. Reintentar no lo va a cambiar y trabaría la cola para siempre detrás
 * de un acceso imposible. Se exceptúan 408 y 429, que sí son "probá de nuevo", y 401/403,
 * que se arreglan solos cuando la sesión se renueva.
 *
 * ⚠️ Y un 400 con código `TENANT_CONTEXT_MISSING`: el pedido salió sin sucursal (el arranque
 * del escritorio la borra hasta confirmarla). Se arregla solo cuando llega la sucursal. Antes
 * el backend lo contestaba con 401 —que ya se reintentaba—; pasó a 400 para no cerrar la
 * sesión, y sin esta excepción la cola tiraría un cobro o una visita real.
 *
 * ⚠️⚠️ Y UN 402: el gimnasio está bloqueado por falta de pago. Eso NO dice nada del movimiento
 * —el cobro y la visita son tan reales como siempre— y se arregla el día que paga. Estaba del
 * lado de "no insistas": al gimnasio que se le vencía la suscripción con cosas en la cola, la
 * cola se las TIRABA una por una, cobros incluidos, sin avisarle a nadie. Se encontró leyendo
 * este código por otro motivo, antes de que le pasara a alguien.
 *
 * @param {number} status el código HTTP
 * @param {string} [codigo] el `error` del cuerpo de la respuesta, si vino
 */
export function esDefinitivo(status, codigo) {
  if (!status || status < 400 || status >= 500) return false;
  if (codigo === 'TENANT_CONTEXT_MISSING') return false;
  return ![408, 429, 401, 403, 402].includes(status);
}

/**
 * Manda lo que haya, en orden y de a uno.
 *
 * <p><b>⭐ EL ORDEN ES DE LA COLA ENTERA, SIN MIRAR EL TIPO.</b> Es lo que hace que el alta de
 * un socio suba antes que el cobro a ese socio: si se mandaran por separado —los accesos por un
 * lado, los cobros por otro— el servidor podría recibir un cobro de alguien que para él todavía
 * no existe. Por eso la cola es una sola y esta función recorre esa lista y no varias.</p>
 *
 * @param {object|Function} enviadores  un objeto `{ACCESO: fn, COBRO: fn, …}` que dice cómo se
 *        manda cada tipo. Cada `fn` recibe UN ítem y debe rechazar con un error que traiga
 *        `response.status` cuando el servidor haya contestado. Se acepta también una función
 *        suelta, que se toma como el enviador de ACCESO.
 * @returns {Promise<{enviados: number, quedan: number, descartados: number, sinEnviador: number}>}
 */
export async function vaciar(enviadores, tenantId = orgActual()) {
  const c = nucleo();
  if (!c) return { enviados: 0, quedan: 0, descartados: 0, sinEnviador: 0 };

  const porTipo = typeof enviadores === 'function' ? { ACCESO: enviadores } : (enviadores || {});

  // Regla 3: un solo vaciado a la vez. Sin esto, dos tandas en paralelo pueden mandar la
  // salida antes que la entrada y dejar al socio invertido.
  if (candado) {
    return { enviados: 0, quedan: await cuantosPendientes(tenantId), descartados: 0, sinEnviador: 0 };
  }
  candado = true;

  let enviados = 0;
  let descartados = 0;
  let sinEnviador = 0;
  try {
    const lista = await pendientes(tenantId);
    for (const item of lista) {
      const enviar = porTipo[item.tipo || 'ACCESO'];

      // ⚠️ UN TIPO SIN ENVIADOR SE QUEDA, NO SE TIRA.
      //
      // Pasa de verdad durante una actualización: el escritorio se actualiza solo pero no
      // todos a la vez, así que un terminal con la versión vieja puede encontrarse en la cola
      // un COBRO que su código todavía no sabe mandar. Descartarlo sería tirar plata; mandarlo
      // al endpoint equivocado, peor. Se queda esperando a la versión que sí sabe.
      //
      // ⛔ Y CORTA LA TANDA. Saltearlo y seguir con el siguiente rompería el orden, que es
      // justo lo que esta cola existe para garantizar.
      if (typeof enviar !== 'function') {
        sinEnviador = lista.length - enviados - descartados;
        break;
      }

      try {
        await enviar(item);
        await c.sacar(item.clientRef);
        enviados++;
      } catch (error) {
        if (esDefinitivo(error?.response?.status, error?.response?.data?.error)) {
          // El servidor lo entendió y lo rechazó para siempre. Sacarlo NO es perder un
          // dato: es sacar del camino algo que nunca va a entrar, para que los que vienen
          // detrás puedan pasar. Sin esto, un solo acceso imposible tapona la cola entera.
          await c.sacar(item.clientRef);
          descartados++;
          continue;
        }
        // Error de red o del servidor: se anota y se CORTA la tanda. Seguir con el
        // siguiente rompería el orden, que es lo único que sostiene la corrección.
        //
        // Se anota QUIÉN dijo que no (ver describirFallo): si fue el servidor, de ahí sale
        // que la pantalla deje de culpar al internet y que el terminal nos avise.
        await c.anotarFallo(item.clientRef, describirFallo(error, item.ultimoError));
        break;
      }
    }
  } finally {
    candado = false;
  }
  return { enviados, quedan: await cuantosPendientes(tenantId), descartados, sinEnviador };
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
  const c = nucleo();
  if (!c) return;
  try {
    await c.olvidar();
  } catch {
    // Si no se pudo, se manda igual en el próximo arranque. No vale interrumpir un
    // cierre de sesión por esto.
  }
}
