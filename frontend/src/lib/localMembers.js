// ============================================
// VELTRONIK - LA LISTA DE SOCIOS, EN LA MÁQUINA
// ============================================
// Buscar un socio en el mostrador tiene que ser instantáneo SIEMPRE: con internet, con
// internet malo, y sin internet.
//
// EL PROBLEMA QUE RESUELVE, EN NÚMEROS
// Hasta acá cada búsqueda salía a la nube. Con el timeout en 20 segundos y dos reintentos
// automáticos, una consulta que no llegaba tardaba MÁS DE UN MINUTO en admitir que no
// pudo — con el socio esperando en el mostrador y la pantalla girando. Los recepcionistas
// no se quejaban de que "va lento": se quejaban de que el sistema tardaba un minuto en
// decir que no.
//
// Ahora la lista vive acá. Buscar no toca la red: es recorrer un array en memoria, o sea
// microsegundos. La red pasa a ser algo que ocurre en el fondo, no algo que el socio espera.
//
// POR QUÉ ESTO NO CONTRADICE LA DECISIÓN ANTERIOR
// El buscador se había pasado al backend a propósito, para no traer todos los socios en
// cada tecla. Ese razonamiento seguía siendo bueno mientras el objetivo era "no mandar
// datos de más". Con el objetivo nuevo —que funcione sin internet— traer la lista UNA vez
// y buscar localmente manda MENOS datos, no más: una carga cada varios minutos contra una
// consulta por cada tecla.
//
// ⚠️ LA CACHÉ MIENTE, Y HAY QUE ASUMIRLO
// Alguien que pagó hace diez minutos en otra terminal, o al que dieron de baja recién, va
// a aparecer con el dato viejo hasta el próximo refresco. Eso no se puede evitar: es la
// naturaleza de tener una copia. Lo que sí se elige es HACIA DÓNDE se equivoca, y la
// decisión es ser permisivo: dejar afuera a un socio que está al día es un problema que se
// lleva el mostrador, mientras que dejar pasar a uno que se dio de baja ayer no le cuesta
// nada a nadie. Por eso la pantalla muestra hace cuánto se actualizó, y cobrar SIEMPRE
// confirma contra el servidor.
//
// DÓNDE VIVE LA COPIA (fase 1 del núcleo local)
// En el escritorio ya no vive en la base del navegador sino en un archivo de SQLite del
// proceso principal, en modo WAL y con `synchronous = FULL`. El motivo no es la velocidad
// —el array en memoria ya la daba— sino el CORTE DE LUZ: IndexedDB es LevelDB por debajo y
// se corrompe con el enchufe; SQLite así configurado no. En el navegador sigue todo igual.

import apiClient from './apiClient';

const DB = 'veltronik-local';
const STORE = 'members';
const VERSION = 1;

// Cada cuánto se refresca sola mientras la app está abierta. Cinco minutos es el punto
// donde el dato es lo bastante fresco para el mostrador sin castigar una conexión pobre.
export const REFRESCO_MS = 5 * 60 * 1000;

// Estado en memoria: es contra esto que se busca, NO contra la base. El archivo es el
// respaldo entre sesiones y entre cortes de luz; el array es lo que hace que la búsqueda
// sea instantánea. Se trae entero una vez cada varios minutos, no una consulta por tecla.
let memoria = { tenantId: null, socios: [], actualizado: null };
let cargando = null;

// ─────────────────────────────────────────────────────────────────────────────
// Dónde se guarda la copia
// ─────────────────────────────────────────────────────────────────────────────
//
// Hay dos lugares posibles y se elige UNA vez, al cargar el módulo:
//
//   · En el ESCRITORIO, el núcleo local: un archivo de SQLite en el proceso principal.
//     Es el que importa. El requisito real no es "que ande con la pestaña cerrada", es
//     que ande después de un CORTE DE LUZ, y ahí IndexedDB —que por debajo es LevelDB—
//     se corrompe. Además el archivo sobrevive a que la pantalla se recargue o se cuelgue.
//
//   · En el NAVEGADOR, IndexedDB, como venía siendo. El portal web no promete funcionar
//     sin internet: la copia local ahí es solo velocidad, y perderla no rompe nada.
//
// Los dos hablan el mismo contrato —`guardar(tenantId, socios)` y `leer(tenantId)`— así
// que de acá para abajo el resto del módulo no sabe cuál le tocó, ni tiene por qué.

/** El núcleo del escritorio, si esta app lo tiene. */
function nucleoDisponible() {
  return typeof window !== 'undefined' && !!window.electronAPI?.nucleo;
}

const almacenNucleo = {
  async guardar(tenantId, socios) {
    try {
      await window.electronAPI.nucleo.guardarEspejo(tenantId, socios);
    } catch {
      // El proceso principal no contestó (recarga en el medio, base sin permisos). La copia
      // en memoria sigue viva y el mostrador sigue trabajando; se reintenta en el próximo ciclo.
    }
  },
  async leer(tenantId) {
    try {
      return await window.electronAPI.nucleo.leerEspejo(tenantId);
    } catch {
      return null;
    }
  },
};

const almacenNavegador = {
  async guardar(tenantId, socios) {
    try {
      const db = await abrirDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ socios, actualizado: Date.now() }, tenantId);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Sin almacenamiento (modo privado, permisos): la app sigue andando con la copia en
      // memoria. Se pierde al cerrar, pero mientras esté abierta funciona igual de rápido.
    }
  },
  async leer(tenantId) {
    try {
      const db = await abrirDB();
      const datos = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(tenantId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(tx.error);
      });
      db.close();
      return datos;
    } catch {
      return null;
    }
  },
};

const almacen = nucleoDisponible() ? almacenNucleo : almacenNavegador;

// En el escritorio, la copia vieja de IndexedDB ya no la lee nadie: se borra. No es
// prolijidad — es el padrón del gimnasio, con nombre y documento de cada socio, y dejarlo
// tirado en una base que nadie mantiene es dejar datos de más en la máquina del mostrador.
if (nucleoDisponible() && typeof indexedDB !== 'undefined') {
  try { indexedDB.deleteDatabase(DB); } catch { /* si no se puede, no pasa nada grave */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardado en el navegador (IndexedDB, sin librerías)
// ─────────────────────────────────────────────────────────────────────────────

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('sin indexedDB')); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La lista
// ─────────────────────────────────────────────────────────────────────────────

/** Solo lo que el mostrador necesita para buscar y decidir. Sin esto la copia pesa de más. */
function comprimir(m) {
  return {
    id: m.id,
    firstName: m.firstName || '',
    lastName: m.lastName || '',
    dni: m.dni || m.document || '',
    phone: m.phone || '',
    email: m.email || '',
    membershipStart: m.membershipStart || null,
    membershipEnd: m.membershipEnd || null,
    // El DTO manda `active` (Jackson serializa el getter `isActive()` sin el "is"). Se
    // aceptan los dos nombres porque la pantalla vieja leía `isActive`, y la AUSENCIA del
    // dato es un socio activo: un campo que falta no es una baja.
    isActive: (m.active ?? m.isActive) !== false,
    // El arancel, para mostrarlo y para pre-elegirlo al cobrar.
    planId: m.planId || null,
    planNombre: m.planNombre || null,
    // La situación la calcula el backend. Se guarda tal cual: recalcularla acá sería volver
    // a tener dos cuentas distintas para el mismo socio, que es el bug que esto vino a cerrar.
    situacion: m.situacion || null,
    diasVencido: m.diasVencido ?? null,
    diasRestantes: m.diasRestantes ?? null,
    // Precalculado UNA vez, al guardar, y no en cada tecla: con dos mil socios, normalizar
    // al vuelo en cada pulsación es trabajo repetido miles de veces por búsqueda.
    //
    // Se calcula ACÁ y viaja hasta la base, en vez de armarlo el núcleo: la misma regla
    // tiene que aplicarse a lo que teclea el usuario (ver `normalizar`), y dos copias de
    // una regla de normalización en dos módulos distintos es la forma más barata de que
    // "josé" deje de encontrar a "Jose" dentro de seis meses.
    busqueda: normalizar(`${m.firstName || ''} ${m.lastName || ''} ${m.dni || m.document || ''}`),
  };
}

/** Saca tildes y mayúsculas: quien busca "jose" tiene que encontrar a "José". */
function normalizar(txt) {
  return (txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Deja la lista lista para usar: primero desde el navegador (instantáneo), y dispara un
 * refresco contra la nube en segundo plano.
 *
 * <p>El orden importa: si esperáramos a la red antes de mostrar algo, con internet malo
 * volveríamos al problema original. Primero lo que tenemos, después lo que llega.</p>
 */
export async function prepararSocios(tenantId, { refrescar = true } = {}) {
  if (!tenantId) return;

  if (memoria.tenantId !== tenantId) {
    memoria = { tenantId, socios: [], actualizado: null };
    const guardado = await almacen.leer(tenantId);
    if (guardado?.socios?.length) {
      memoria = { tenantId, socios: guardado.socios, actualizado: guardado.actualizado };
    }
  }

  if (refrescar) {
    // Sin await a propósito: que la pantalla no espere a la red para poder buscar.
    refrescarSocios(tenantId).catch(() => {});
  }
}

/**
 * Trae la lista de la nube y la guarda. Falla en silencio: si no hay internet nos quedamos
 * con la copia que había, que es exactamente para lo que existe.
 */
export async function refrescarSocios(tenantId) {
  if (!tenantId || cargando) return cargando;

  cargando = (async () => {
    try {
      // Timeout corto: esto corre en el fondo y nadie lo está esperando. Si la conexión
      // está mal, mejor rendirse rápido y reintentar en el próximo ciclo que dejar una
      // petición colgada ocupando la única conexión buena que haya.
      const { data } = await apiClient.get('/gym/members', { timeout: 12000 });
      const lista = Array.isArray(data) ? data : (data?.content || []);
      const socios = lista.map(comprimir);
      const actualizado = Date.now();

      // Primero la memoria y recién después el disco: buscar tiene que andar en el
      // instante siguiente, sin esperar a que termine de escribirse el archivo.
      memoria = { tenantId, socios, actualizado };
      await almacen.guardar(tenantId, socios);
      return socios;
    } catch {
      return memoria.socios;
    } finally {
      cargando = null;
    }
  })();

  return cargando;
}

/**
 * Busca en la copia local. INSTANTÁNEO: no toca la red.
 *
 * <p>Coincide por nombre, apellido o documento, sin tildes ni mayúsculas. Los que empiezan
 * con lo tecleado van primero — quien escribe "gon" casi siempre busca a "González", no a
 * "Aragón".</p>
 */
export function buscarSocios(termino, limite = 20) {
  const q = normalizar(termino);
  if (!q) return memoria.socios.slice(0, limite).map(vista);

  const empiezan = [];
  const contienen = [];
  for (const s of memoria.socios) {
    const i = (s.busqueda || "").indexOf(q);
    if (i === 0) empiezan.push(s);
    else if (i > 0) contienen.push(s);
    if (empiezan.length >= limite) break;
  }
  return [...empiezan, ...contienen].slice(0, limite).map(vista);
}

/** El formato que espera la UI (mismo contrato que tenía el buscador de la nube). */
function vista(s) {
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    fullName: `${s.firstName} ${s.lastName}`.trim(),
    dni: s.dni,
    document: s.dni,
    phone: s.phone,
    email: s.email,
    membershipStart: s.membershipStart ?? null,
    membershipEnd: s.membershipEnd,
    isActive: s.isActive,
    planId: s.planId ?? null,
    planNombre: s.planNombre ?? null,
    situacion: s.situacion,
    diasVencido: s.diasVencido,
    diasRestantes: s.diasRestantes,
  };
}

/** ¿Hay algo cargado y de cuándo es? Lo usa el cartel de estado del mostrador. */
export function estadoSocios() {
  return {
    cantidad: memoria.socios.length,
    actualizado: memoria.actualizado,
    vacia: memoria.socios.length === 0,
  };
}

/** Al cambiar de sucursal o cerrar sesión: la lista de un gimnasio no sirve para otro. */
export function olvidarSocios() {
  memoria = { tenantId: null, socios: [], actualizado: null };
}
