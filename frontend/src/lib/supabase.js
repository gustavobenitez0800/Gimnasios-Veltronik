import { createClient } from '@supabase/supabase-js';
import { createResilientFetch } from './resilientFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Fotografía de la URL con la que se abrió la pestaña, tomada ANTES de construir el
 * cliente de Supabase — por eso vive acá arriba y no en otro módulo: así no depende del
 * orden de imports de nadie.
 *
 * Por qué hace falta: con `detectSessionInUrl: true`, el cliente procesa el "?code=..."
 * apenas se crea y LIMPIA la URL. La página /desktop-auth (que solo tiene que reenviarle
 * ese código a la app de escritorio, no canjearlo) llegaría tarde y encontraría la URL ya
 * barrida. Leyendo de esta constante siempre ve lo que vino.
 */
export const INITIAL_URL = typeof window !== 'undefined' ? window.location.href : '';

// Toda llamada de auth de Supabase (signIn, getSession, refresh de token) pasa por este
// fetch resiliente: timeout por intento + reintentos con backoff. Antes el cliente se
// creaba sin opciones → sin timeout (la app podía colgarse en redes lentas) y sin
// reintentos (un blip de red = "Error de conexión" en el login). Se inyecta SOLO el
// fetch: el resto de la config de auth queda en los defaults de Supabase.
const fetchConReintentos = createResilientFetch({
  timeoutMs: 10000,
  retries: 2,
  onRetry: ({ attempt, status, error, delay }) => {
    console.warn(
      `[supabase] reintento ${attempt} en ${delay}ms`,
      status ? `(HTTP ${status})` : `(${error?.message || 'error de red'})`,
    );
  },
});

/**
 * ⭐ EL FETCH QUE NO REINTENTA NUNCA, Y POR QUÉ EXISTE.
 *
 * <b>Este es el arreglo del bug de "el escritorio me manda al login solo".</b>
 *
 * El refresh token de Supabase es de UN SOLO USO y rota: el servidor lo consume, emite uno
 * nuevo, y tolera que se vuelva a presentar el viejo solo durante una ventana de ~10
 * segundos (ahí devuelve la misma sesión). Pasada esa ventana, un token reusado se
 * interpreta como token ROBADO y Supabase revoca la familia de sesiones entera.
 *
 * Con reintentos, caíamos justo del lado malo:
 *
 *   t=0 s     sale el refresh con RT1 → llega al servidor, que CONSUME RT1 y emite RT2
 *   t=10 s    la respuesta no volvió (el internet del gimnasio) → nuestro timeout aborta
 *   t≈10,5 s  REINTENTO con el mismo RT1, ya fuera de la ventana de 10 s
 *             → Supabase lo lee como robo → revoca la familia → sesión muerta
 *
 * Le pegaba al escritorio y casi no a la web porque el escritorio está prendido todo el día
 * y renueva el token cada hora; la web se abre, se usa y se cierra.
 *
 * ⚠️ Y por eso aparecía "de la nada": el backend valida el token con JWKS asimétrico, o sea
 * que solo mira firma y vencimiento y NUNCA pregunta si la sesión fue revocada. El access
 * token seguía andando hasta una hora después, así que el logout caía en un momento que no
 * tenía ninguna relación con lo que lo había causado.
 *
 * El timeout es más largo a propósito: abortar temprano también mata la sesión, porque si el
 * servidor ya consumió RT1 y nosotros nos vamos sin escuchar la respuesta, perdemos RT2 y el
 * que tenemos guardado ya no sirve. Hay que darle a la respuesta todas las chances de llegar.
 */
const fetchDeUnSoloTiro = createResilientFetch({ timeoutMs: 30000, retries: 0 });

/** La URL de un fetch, que puede venir como string, URL o Request. */
function urlDe(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url || '';
}

/**
 * ¿Este pedido gasta una credencial de un solo uso?
 *
 * Solo estos dos grants. El login con contraseña (`grant_type=password`) NO entra acá y sigue
 * reintentándose: no consume nada rotativo, y reintentarlo es justamente para lo que se
 * construyó el fetch resiliente ("un solo parpadeo de red = Error de conexión en el login").
 *
 *   · `refresh_token` → el que revoca la sesión entera si se reintenta tarde.
 *   · `pkce`          → canjea el "?code=" del mail o del OAuth. Reintentarlo no rompe la
 *                       sesión, pero el código ya se gastó: el reintento solo puede fallar.
 */
function gastaUnaCredencialDeUnSoloUso(input) {
  const url = urlDe(input);
  return url.includes('grant_type=refresh_token') || url.includes('grant_type=pkce');
}

/** Elige el fetch según lo que el pedido se juega si se repite. */
function fetchDeSupabase(input, init) {
  return gastaUnaCredencialDeUnSoloUso(input)
    ? fetchDeUnSoloTiro(input, init)
    : fetchConReintentos(input, init);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchDeSupabase },
  auth: {
    // PKCE: el link de recuperación y el OAuth vuelven con "?code=..." (query param)
    // en vez de tokens en el fragmento "#...". Clave con HashRouter: el flujo implícito
    // metía los tokens en el mismo "#" que usa el router y la sesión de recuperación
    // nunca se creaba → "me llega el mail pero no puedo poner la contraseña nueva".
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
