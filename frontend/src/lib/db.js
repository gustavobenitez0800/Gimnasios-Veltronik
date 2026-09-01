// ============================================
// VELTRONIK - EL DEPÓSITO LOCAL DEL TERMINAL
// ============================================
// UN solo dueño de la base de IndexedDB: acá se declaran el nombre, la versión y TODOS
// los almacenes. Los módulos piden el almacén que necesitan y no saben de versiones.
//
// ⭐ POR QUÉ ESTO EXISTE — un bug que dejó al mostrador sin poder buscar socios
//
// Antes cada módulo abría la base por su cuenta con su propia versión: la lista de socios
// con la 1, la cola de accesos con la 2. IndexedDB NO deja abrir una base pidiendo una
// versión menor que la que ya tiene — falla. Así que en cuanto la cola subía la base a la
// versión 2, la lista de socios no podía abrirla nunca más: el padrón local no cargaba y
// escribir un DNI no encontraba a nadie. En la web y en el escritorio a la vez, porque el
// código es el mismo.
//
// El síntoma no se parecía a la causa: "no puedo buscar socios" y "agregué una cola de
// accesos" no tienen nada que ver entre sí, salvo que comparten un recurso que nadie
// declaró como compartido.
//
// ⚠️ PARA AGREGAR UN ALMACÉN NUEVO: sumalo a ALMACENES, subí VERSION_DB en uno, y creá el
// almacén dentro de `onupgradeneeded` respetando los que ya existen. Nunca abras esta base
// desde otro archivo.

export const NOMBRE_DB = 'veltronik-local';

/**
 * Versión del esquema. Se sube al agregar o cambiar un almacén.
 *
 * Historia: 1 = socios. 2 = + cola de accesos sin conexión.
 */
export const VERSION_DB = 2;

/** Los almacenes, por nombre. Los módulos usan estas constantes, no literales sueltos. */
export const ALMACENES = {
  SOCIOS: 'members',
  COLA_ACCESOS: 'cola-accesos',
};

/**
 * Abre la base, creando lo que falte.
 *
 * <p>El {@code onupgradeneeded} crea TODOS los almacenes, no solo el de quien llamó: la
 * actualización corre una sola vez, y si dejara alguno afuera el módulo que lo pida después
 * se encontraría con una base a la versión correcta pero sin su almacén.</p>
 */
export function abrirDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('este navegador no tiene almacenamiento local'));
      return;
    }
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);

    req.onupgradeneeded = () => {
      const db = req.result;

      // La lista de socios: clave el id del gimnasio, valor el padrón comprimido.
      if (!db.objectStoreNames.contains(ALMACENES.SOCIOS)) {
        db.createObjectStore(ALMACENES.SOCIOS);
      }

      // La cola de accesos: la clave es el sello del acceso, y se lee siempre por el
      // momento en que ocurrió, que es lo que garantiza el orden al vaciarla.
      if (!db.objectStoreNames.contains(ALMACENES.COLA_ACCESOS)) {
        const cola = db.createObjectStore(ALMACENES.COLA_ACCESOS, { keyPath: 'clientRef' });
        cola.createIndex('porMomento', 'ocurridoEn');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Corre algo sobre un almacén y cierra la base al terminar.
 *
 * <p>Se abre y se cierra en cada operación en vez de mantener una conexión viva porque una
 * conexión abierta BLOQUEA la próxima actualización de esquema: al subir la versión, el
 * navegador espera a que todas las conexiones se cierren, y una que quedó colgada deja la
 * app trabada sin ningún error visible.</p>
 */
export async function conAlmacen(nombre, modo, fn) {
  const db = await abrirDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(nombre, modo);
      const store = tx.objectStore(nombre);
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

/** Envuelve un pedido de IndexedDB en una promesa. */
export const pedir = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
