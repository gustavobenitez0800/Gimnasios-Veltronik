/**
 * ============================================
 * VELTRONIK - LISTA BLANCA DEL PORTAL (Fase 4)
 * ============================================
 *
 * A qué direcciones puede la app mandar el navegador del sistema.
 *
 * POR QUÉ ESTO EXISTE
 * `shell.openExternal()` con una URL sin validar es una clase conocida de vulnerabilidad
 * en Electron: no se limita a http/https — un renderer comprometido (o un XSS) puede
 * lanzar `file://`, `smb://` y protocolos que terminan ejecutando cosas en la máquina
 * del cliente. La URL la propone el renderer; quién decide si se abre es ESTE proceso.
 *
 * Se valida por ORIGEN COMPLETO, no por "que contenga veltronik": `https://veltronik-v2.
 * vercel.app.atacante.com` contiene el dominio y no es nuestro.
 *
 * ⚠️ SINCRONIZAR: el destino real lo arma el renderer desde `CONFIG.PUBLIC_WEB_URL`
 * (src/lib/config.js). Si cambia el dominio del portal, hay que tocarlo en los dos lados
 * o el botón de pago deja de abrir.
 */

/** Orígenes permitidos. Sin barra final, en minúscula. */
const ALLOWED_ORIGINS = [
  // El que efectivamente se usa hoy: es el fallback de CONFIG.PUBLIC_WEB_URL, y
  // VITE_PUBLIC_WEB_URL no está seteada ni en los .env ni en los secrets del release.
  'https://veltronik-v2.vercel.app',
  // El proyecto de Vercel con su nombre largo (package.json → homepage). Se acepta
  // para que un cambio de dominio no deje la app muda.
  'https://gimnasio-veltronik-veltroniks-projects.vercel.app',
];

/**
 * Origen extra por variable de entorno, para probar contra un preview de Vercel o un
 * localhost sin recompilar. Solo se admite https, o http contra la máquina local.
 */
function extraOrigin() {
  const raw = process.env.VELTRONIK_PORTAL_ORIGIN;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && isLocal)) {
      return u.origin.toLowerCase();
    }
  } catch {
    // Una env var mal escrita no habilita nada: se ignora en silencio.
  }
  return null;
}

/** Todos los orígenes válidos en esta ejecución. */
function allowedOrigins() {
  const extra = extraOrigin();
  return extra ? [...ALLOWED_ORIGINS, extra] : [...ALLOWED_ORIGINS];
}

/**
 * ¿Se puede abrir esta URL en el navegador del sistema?
 * Falla cerrada: cualquier cosa que no sea una URL parseable con un origen de la lista
 * devuelve false.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
/**
 * ¿Es el endpoint de autorización de Supabase? (Fase 2)
 *
 * El login con Google del escritorio abre en el navegador una URL que genera el propio
 * cliente de Supabase (`https://<proyecto>.supabase.co/auth/v1/authorize?...`), y el
 * subdominio del proyecto sale de una variable de entorno de build que el proceso
 * principal no puede leer. Por eso se autoriza el dominio, no un origen exacto.
 *
 * La regla exige https y que el host TERMINE en ".supabase.co" — con el punto. Así
 * `evil-supabase.co` y `supabase.co.atacante.com` quedan afuera, que es el error clásico
 * de escribir esta clase de chequeo con un "contiene".
 */
function isSupabaseAuthUrl(parsed) {
  return parsed.protocol === 'https:' && parsed.hostname.toLowerCase().endsWith('.supabase.co');
}

function isAllowedUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (isSupabaseAuthUrl(parsed)) return true;
  return allowedOrigins().includes(parsed.origin.toLowerCase());
}

module.exports = { isAllowedUrl, allowedOrigins };
