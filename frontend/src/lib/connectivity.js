// ============================================
// VELTRONIK - CONNECTIVITY DIAGNOSIS (capa de diagnóstico)
// ============================================
// Cuando una llamada de red falla a nivel "fetch" (no es un error HTTP del backend),
// el mensaje genérico "revisá tu internet" suele ser FALSO: la internet del cliente
// anda, pero algo bloquea específicamente a Supabase (típicamente el antivirus con
// escaneo HTTPS/SSL, o un firewall/red corporativa). Esta sonda distingue las causas
// para mostrar un mensaje accionable y cortar el ida y vuelta con soporte.
//
// Cómo funciona: sondea EN PARALELO el endpoint de auth de Supabase y el backend.
// Con `mode: 'no-cors'` solo nos importa si el server RESPONDE (la promesa resuelve)
// o NO (la promesa rechaza por DNS/cert/timeout); el status es irrelevante. Así un
// 401/404 cuenta como "alcanzable" y CORS no nos hace ver caído a un server que está.

import CONFIG from './config';

export const CONNECTIVITY = Object.freeze({
  ONLINE: 'ONLINE', // ambos alcanzables → el fallo fue transitorio
  OFFLINE: 'OFFLINE', // sin internet (o nada alcanzable)
  AUTH_UNREACHABLE: 'AUTH_UNREACHABLE', // backend OK pero Supabase no → bloqueo a *.supabase.co
  BACKEND_UNREACHABLE: 'BACKEND_UNREACHABLE', // Supabase OK pero backend no
});

const PROBE_TIMEOUT_MS = 4000;

/** ¿El servidor responde algo? (resuelve = sí; rechaza/timeout = no). */
async function reachable(url) {
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Clasifica el estado de conectividad real del cliente.
 * Es best-effort (orientativo, no infalible): sirve para elegir el mejor mensaje.
 * @returns {Promise<keyof typeof CONNECTIVITY>}
 */
export async function diagnoseConnectivity() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return CONNECTIVITY.OFFLINE;
  }

  const authProbe = CONFIG.SUPABASE_URL ? `${CONFIG.SUPABASE_URL}/auth/v1/health` : null;
  const backendProbe = CONFIG.API_URL || null;

  const [authOk, backendOk] = await Promise.all([reachable(authProbe), reachable(backendProbe)]);

  if (authOk && backendOk) return CONNECTIVITY.ONLINE;
  if (!authOk && !backendOk) return CONNECTIVITY.OFFLINE;
  if (backendOk && !authOk) return CONNECTIVITY.AUTH_UNREACHABLE;
  return CONNECTIVITY.BACKEND_UNREACHABLE;
}

export default diagnoseConnectivity;
