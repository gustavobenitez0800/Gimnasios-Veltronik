// ============================================
// VELTRONIK - LOGIN CON GOOGLE EN EL ESCRITORIO (Fase 2)
// ============================================
// El problema que resuelve: la app de escritorio se sirve por file://, y Google no puede
// redirigir de vuelta a un file://. Por eso el botón de Google estaba escondido en
// Electron desde siempre — el escritorio tenía un login peor que la web.
//
// EL RECORRIDO
//   1. La app arranca el flujo PKCE de Supabase, pero le dice `skipBrowserRedirect`:
//      en vez de navegar, le devuelve la URL de autorización.
//   2. Esa URL se abre en el NAVEGADOR DEL SISTEMA (nunca en la ventana de la app).
//   3. El usuario se loguea con Google ahí. Supabase lo devuelve al PORTAL, a
//      /desktop-auth, con un `?code=...`.
//   4. El portal no canjea nada: reenvía el código a `veltronik://auth?code=...`.
//   5. Windows despierta a la app, que canjea el código por la sesión.
//
// POR QUÉ ES SEGURO QUE EL CÓDIGO VIAJE POR EL NAVEGADOR
// Porque el flujo lo arranca la APP, y con PKCE el `code_verifier` queda guardado en la
// máquina del cliente — nunca sale. El código suelto no sirve para nada sin él: quien lo
// intercepte (en el historial del navegador, en un handler de protocolo que mira los
// argumentos) no puede canjearlo. Es la misma razón por la que los CLIs y las apps de
// escritorio serias usan PKCE y no un token en la URL.
//
// Es también por qué NO hace falta un nonce extra: si una página maliciosa invocara
// `veltronik://auth?code=<código del atacante>`, el canje fallaría igual, porque nuestro
// verifier no corresponde a ese código. Lo único que agregamos es la marca de "yo pedí
// esto", abajo, para no intentar canjes que nadie pidió.

import { supabase } from './supabase';
import { portalUrl } from './portal';
import { readAuthCode, readAuthError } from './authCode';
import CONFIG from './config';

/** Ruta del portal que hace de relevo. Tiene que existir en WebRoutes. */
const RELAY_PATH = '/#/desktop-auth';

/** Marca de "hay un login de escritorio en curso". */
const PENDING_KEY = 'desktop_auth_pending_at';

/** Un intento de login vence a los 10 minutos. */
const PENDING_TTL_MS = 10 * 60 * 1000;

function markPending() {
  try {
    localStorage.setItem(PENDING_KEY, String(Date.now()));
  } catch { /* almacenamiento no disponible: seguimos igual */ }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch { /* idem */ }
}

/** ¿Este equipo pidió un login por navegador hace poco? */
function hasPending() {
  try {
    const at = Number(localStorage.getItem(PENDING_KEY));
    if (!at) return false;
    return Date.now() - at < PENDING_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Arranca el login con Google desde el escritorio: abre el navegador del sistema.
 * La sesión NO queda creada al volver de esta función — llega después, por el deep link
 * (ver `completeFromDeepLink`).
 *
 * @throws si Supabase no devuelve la URL, o si el navegador no se pudo abrir.
 */
export async function startGoogleSignIn() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // El retorno va al PORTAL, que es una URL http de verdad. Un file:// no puede
      // recibir un redirect, y ese era el bloqueo original.
      redirectTo: portalUrl(RELAY_PATH),
      // Que NO navegue esta ventana: solo queremos la URL para abrirla afuera.
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Supabase no devolvió la URL de autorización.');

  markPending();

  const opened = await openExternalUrl(data.url);
  if (!opened) {
    clearPending();
    throw new Error('No pudimos abrir el navegador para completar el login.');
  }
}

/**
 * Abre la URL de autorización de Supabase en el navegador.
 * No pasa por `openPortal` porque el destino es el dominio de Supabase, no el del portal;
 * la lista blanca del proceso principal (electron/portal.cjs) contempla los dos.
 */
async function openExternalUrl(url) {
  try {
    return (await window.electronAPI?.openExternal?.(url)) === true;
  } catch {
    return false;
  }
}

/**
 * Completa el login a partir del `veltronik://auth?code=...` que llegó por el deep link.
 *
 * @param {string} deepLinkUrl
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function completeFromDeepLink(deepLinkUrl) {
  const failure = readAuthError(deepLinkUrl);
  if (failure) {
    clearPending();
    return { ok: false, reason: failure };
  }

  const code = readAuthCode(deepLinkUrl);
  if (!code) return { ok: false, reason: 'El enlace no traía un código de acceso.' };

  // Nadie pidió este login: puede ser un enlace viejo o una página ajena invocando el
  // protocolo. El canje fallaría igual por PKCE, pero no vale la pena ni intentarlo.
  if (!hasPending()) {
    return { ok: false, reason: 'No había un inicio de sesión en curso en este equipo.' };
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  clearPending();

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** URL del relevo, para mostrarla si hay que abrirla a mano. */
export function relayUrl() {
  return portalUrl(RELAY_PATH);
}

/** ¿Este build puede hacer el login por navegador? */
export function canUseBrowserSignIn() {
  return CONFIG.IS_DESKTOP && typeof window !== 'undefined' && !!window.electronAPI?.openExternal;
}
