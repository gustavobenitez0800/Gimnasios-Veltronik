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

import apiClient from './apiClient';

import { ALMACENES, conAlmacen, pedir } from './db';

// Cada cuánto se refresca sola mientras la app está abierta. Cinco minutos es el punto
// donde el dato es lo bastante fresco para el mostrador sin castigar una conexión pobre.
export const REFRESCO_MS = 5 * 60 * 1000;

// Estado en memoria: es contra esto que se busca, no contra la base del navegador.
// IndexedDB es el respaldo entre sesiones; el array es lo que hace que la búsqueda sea
// instantánea.
let memoria = { tenantId: null, socios: [], actualizado: null };
let cargando = null;

// ─────────────────────────────────────────────────────────────────────────────
// Guardado en el navegador. El esquema NO vive acá: lo declara db.js, que es el único
// dueño de la base. Tener dos módulos abriéndola con su propia versión es exactamente lo
// que dejó al mostrador sin poder buscar socios.
// ─────────────────────────────────────────────────────────────────────────────


async function guardar(tenantId, datos) {
  try {
    await conAlmacen(ALMACENES.SOCIOS, 'readwrite', (store) => pedir(store.put(datos, tenantId)));
  } catch {
    // Sin almacenamiento (modo privado, permisos): la app sigue andando con la copia en
    // memoria. Se pierde al cerrar, pero mientras esté abierta funciona igual de rápido.
  }
}

async function leer(tenantId) {
  try {
    const datos = await conAlmacen(ALMACENES.SOCIOS, 'readonly', (store) => pedir(store.get(tenantId)));
    return datos || null;
  } catch {
    return null;
  }
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
    membershipEnd: m.membershipEnd || null,
    isActive: m.isActive !== false,
    // La situación la calcula el backend. Se guarda tal cual: recalcularla acá sería volver
    // a tener dos cuentas distintas para el mismo socio, que es el bug que esto vino a cerrar.
    situacion: m.situacion || null,
    diasVencido: m.diasVencido ?? null,
    diasRestantes: m.diasRestantes ?? null,
    // Precalculado UNA vez, al guardar, y no en cada tecla: con dos mil socios, normalizar
    // al vuelo en cada pulsación es trabajo repetido miles de veces por búsqueda.
    _busqueda: `${m.firstName || ''} ${m.lastName || ''} ${m.dni || m.document || ''}`
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, ''),
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
    const guardado = await leer(tenantId);
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

      memoria = { tenantId, socios, actualizado };
      await guardar(tenantId, { socios, actualizado });
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
    const i = s._busqueda.indexOf(q);
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
    membershipEnd: s.membershipEnd,
    isActive: s.isActive,
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
