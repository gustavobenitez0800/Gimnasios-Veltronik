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
