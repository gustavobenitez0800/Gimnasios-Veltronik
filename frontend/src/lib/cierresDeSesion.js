// ============================================
// VELTRONIK - POR QUÉ SE CERRÓ LA SESIÓN
// ============================================
// "La app me sacó sola" se atacó cinco veces a ciegas: lo único que quedaba era un renglón en
// la consola de una PC que nadie tiene a mano, la del mostrador. Acá cada cierre se anota con
// su motivo y se le avisa al servidor, para leerlo sin ir hasta el gimnasio.
//
// CÓMO VIAJA
// El aviso se anota en este equipo en el momento, y sube cuando hay una sesión con la cual
// subirlo: la misma, si la cerró alguien con un botón (se sube antes de salir); la siguiente,
// si se cayó sola (se sube apenas alguien vuelve a entrar). Una sesión muerta no puede avisar
// de su propia muerte: el pedido saldría sin credencial.
//
// ⚠️ ESTO ES DIAGNÓSTICO Y NO PUEDE ROMPER NADA
// Nada de acá tira. Un `localStorage` lleno, un servidor caído o una respuesta rara dejan el
// aviso para la próxima vez, y la sesión sigue su camino. Y el pedido que avisa de un cierre
// va marcado para que un 401 suyo no provoque otro cierre.
// ============================================

import apiClient from './apiClient';
import { momentoLocal, nuevoSello } from './colaAccesos';

const CLAVE = 'veltronik_cierres_de_sesion';
const CLAVE_HABIA_SESION = 'veltronik_habia_sesion';

/** Cuántos avisos se guardan sin subir. Los más viejos se van: lo que importa es lo último. */
export const MAXIMO_PENDIENTES = 20;

export const MOTIVOS = Object.freeze({
  /** Alguien apretó "Salir". */
  USUARIO: 'USUARIO',
  /** Alguien apretó "Cerrar sesión en todos los dispositivos". */
  USUARIO_TODOS: 'USUARIO_TODOS',
  /** El backend rechazó un pedido con 401 y la renovación tampoco pudo. */
  RESPUESTA_401: 'RESPUESTA_401',
  /** Supabase dio la sesión por terminada sin que nadie se lo pidiera. */
  SUPABASE: 'SUPABASE',
  /** Al abrir no había sesión, y la última vez que se cerró la app sí había. */
  SE_PERDIO_AL_ABRIR: 'SE_PERDIO_AL_ABRIR',
});

function leer() {
  try {
    const lista = JSON.parse(window.localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function guardar(lista) {
  try {
    if (lista.length === 0) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    // Sin dónde guardarlo se pierde un renglón de diagnóstico. No vale más que eso.
  }
}

/**
 * Deja dicho que en este equipo hay una sesión iniciada, y de quién.
 *
 * Es lo que permite distinguir, la próxima vez que la app abra sin sesión, "nunca nadie
 * entró" de "había alguien adentro y ya no está".
 */
export function recordarQueHaySesion(userId) {
  try {
    window.localStorage.setItem(CLAVE_HABIA_SESION, userId || '?');
  } catch { /* sin dónde anotarlo */ }
}

/** De quién era la sesión que este equipo tenía iniciada, o null si no había ninguna. */
export function habiaSesion() {
  try {
    return window.localStorage.getItem(CLAVE_HABIA_SESION);
  } catch {
    return null;
  }
}

/**
 * Anota un cierre de sesión para avisarle al servidor.
 *
 * Con el cierre anotado, este equipo ya no "tiene una sesión": si después llega otro aviso
 * automático por el mismo cierre (Supabase emite su evento también cuando cerramos nosotros),
 * `anotarSiHabiaSesion` no lo cuenta dos veces.
 *
 * @param {string} motivo uno de MOTIVOS
 * @param {{ detalle?: string, userId?: string }} [datos]
 */
export function anotarCierre(motivo, { detalle, userId } = {}) {
  try {
    const deQuien = userId || habiaSesion();
    const lista = leer();
    lista.push({
      clientRef: nuevoSello(),
      ocurridoEn: momentoLocal(),
      motivo,
      detalle: detalle ? String(detalle).slice(0, 500) : undefined,
      userId: deQuien && deQuien !== '?' ? deQuien : undefined,
      plataforma: window.electronAPI ? 'escritorio' : 'web',
    });
    guardar(lista.slice(-MAXIMO_PENDIENTES));
    window.localStorage.removeItem(CLAVE_HABIA_SESION);
  } catch {
    // Ver el encabezado: nada de acá puede frenar un cierre de sesión.
  }
}

/**
 * Anota un cierre que nadie pidió, SOLO si este equipo tenía una sesión.
 *
 * Para los avisos automáticos: el evento de Supabase y el "abrí y no había nada". Sin la
 * condición, cada apertura de una app en la que nunca entró nadie anotaría un cierre.
 *
 * @returns {boolean} si lo anotó
 */
export function anotarSiHabiaSesion(motivo, datos) {
  if (!habiaSesion()) return false;
  anotarCierre(motivo, datos);
  return true;
}

/** Los avisos que todavía no subieron. */
export function cierresPendientes() {
  return leer();
}

let subiendo = null;

/**
 * Sube los avisos pendientes. No tira nunca, y dos llamadas a la vez son un solo pedido.
 *
 * @returns {Promise<number>} cuántos quedaron anotados en el servidor
 */
export function subirCierres() {
  if (subiendo) return subiendo;
  const pendientes = leer();
  if (pendientes.length === 0) return Promise.resolve(0);

  subiendo = (async () => {
    try {
      const { data } = await apiClient.post('/account/cierres-de-sesion', { cierres: pendientes }, {
        // Un 401 de ESTE pedido no puede cerrar la sesión: avisar de un cierre no provoca otro.
        __noCierraSesion: true,
      });
      const anotados = new Set(Array.isArray(data?.anotados) ? data.anotados : []);
      // Se releen: mientras el pedido viajaba pudo anotarse otro cierre, y ese no se borra.
      guardar(leer().filter((c) => !anotados.has(c.clientRef)));
      return anotados.size;
    } catch {
      return 0; // quedan para la próxima
    } finally {
      subiendo = null;
    }
  })();
  return subiendo;
}

/** Sube los pendientes esperando como mucho `ms`: para no demorar un "Salir" por un aviso. */
export function subirCierresSinDemorar(ms = 2000) {
  return Promise.race([
    subirCierres(),
    new Promise((resolve) => setTimeout(() => resolve(0), ms)),
  ]);
}
