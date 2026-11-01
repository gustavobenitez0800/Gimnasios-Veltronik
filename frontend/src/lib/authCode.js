// ============================================
// VELTRONIK - LECTURA DEL "?code=" DE PKCE
// ============================================
// Con PKCE, Supabase devuelve un `?code=...` que hay que canjear por la sesión. Dónde
// aparece ese parámetro depende de cómo quedó armada la URL de retorno, y la app usa
// HashRouter, así que puede caer en dos lugares distintos:
//
//   https://portal/?code=abc#/reset-password        → en el search real
//   https://portal/#/desktop-auth?code=abc          → adentro del hash
//
// Esta función mira los dos. Vivía duplicada dentro de AuthService.exchangeRecoveryCode;
// ahora que el login de escritorio necesita lo mismo, es una sola.

/**
 * Saca el `code` de PKCE de una URL, venga donde venga.
 * @param {string} href URL completa
 * @returns {string|null}
 */
export function readAuthCode(href) {
  if (!href) return null;

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const fromSearch = url.searchParams.get('code');
  if (fromSearch) return fromSearch;

  // `hash` viene como "#/ruta?code=abc": partimos en el primer '?'.
  const hashQuery = url.hash.split('?')[1];
  if (hashQuery) return new URLSearchParams(hashQuery).get('code');

  return null;
}

/**
 * Saca el error que Supabase puede devolver en vez del código (por ejemplo si el usuario
 * cancela en la pantalla de Google). Mismo problema de ubicación que `readAuthCode`.
 * @param {string} href
 * @returns {string|null} descripción legible del error, o null si no hubo
 */
export function readAuthError(href) {
  if (!href) return null;

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const pick = (params) => params.get('error_description') || params.get('error');

  const fromSearch = pick(url.searchParams);
  if (fromSearch) return fromSearch;

  const hashQuery = url.hash.split('?')[1];
  if (hashQuery) return pick(new URLSearchParams(hashQuery));

  return null;
}

/**
 * El `token_hash` de un link de RECUPERACIÓN de contraseña, o null.
 *
 * <p>La plantilla "Reset password" de Supabase lo manda como
 * `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery#/reset-password`. A diferencia del
 * `?code=` de PKCE, anda en cualquier navegador y no vence a los 5 minutos de haberlo pedido: el
 * mismo problema que tenía la confirmación del alta (ver lib/vueltaDelCorreo.js).</p>
 * @param {string} href URL completa
 * @returns {string|null}
 */
export function readRecoveryTokenHash(href) {
  if (!href) return null;

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  // Mismo problema de ubicación que `readAuthCode`: el search real o adentro del hash.
  const hashQuery = url.hash.split('?')[1];
  for (const params of [url.searchParams, new URLSearchParams(hashQuery || '')]) {
    if (params.get('type') === 'recovery' && params.get('token_hash')) return params.get('token_hash');
  }
  return null;
}

/** Saca de la barra de direcciones el `token_hash` de la recuperación, sin tocar la ruta del hash. */
export function clearRecoveryTokenHash() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('token_hash');
    url.searchParams.delete('type');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* sin history: queda como estaba, no rompe nada */ }
}
