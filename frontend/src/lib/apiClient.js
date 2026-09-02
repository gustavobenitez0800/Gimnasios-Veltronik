import axios from 'axios';

// Instancia base de Axios apuntando al backend de Java (Fase 3)
// `timeout`: sin esto, una request a un backend lento/inalcanzable quedaba colgada
// indefinidamente (la UI trabada). 20s es holgado para Railway y corta los cuelgues.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Reintentos para errores de RED (sin respuesta HTTP) en métodos idempotentes. Un blip
// transitorio de red no debe romper un GET; los reintentamos con backoff. NUNCA se
// reintenta un POST/PUT/DELETE (evita duplicar cobros, altas, etc.) ni un error con
// respuesta HTTP (4xx/5xx ya son decisiones del backend, no fallos de transporte).
// UN reintento, no dos.
//
// Con dos, un GET que no llega tarda el timeout COMPLETO tres veces seguidas antes de
// admitir la falla: 20s + 20s + 20s = más de un minuto con la pantalla girando y el socio
// esperando en el mostrador. Los recepcionistas no se quejaban de que "va lento" — se
// quejaban de eso.
//
// El segundo reintento casi nunca salva nada: si dos intentos separados por medio segundo
// fallaron, el problema no es un paquete perdido. Lo que sí hace es triplicar la espera.
const NETWORK_RETRY = { maxRetries: 1, baseDelayMs: 500, maxDelayMs: 3000, methods: ['get', 'head'] };

import { supabase } from './supabase';
import { getDeviceId } from './deviceId';
import { getShiftId } from './shift';

/**
 * El token de la sesión, insistiendo un poco.
 *
 * <p>{@code getSession()} puede fallar o colgarse por contención del lock de Supabase, y
 * también puede devolver vacío durante los milisegundos en que el token se está renovando.
 * Las dos cosas son pasajeras. Tres intentos cortos cubren esa ventana sin hacer esperar a
 * nadie de más; si después de eso no hay token, el problema es real.</p>
 */
/**
 * Cuánto se espera a que Supabase conteste quién es el usuario.
 *
 * ⚠️ ESTO NO ES DECORATIVO. `getSession()` no solo puede fallar: puede COLGARSE por
 * contención del lock de Supabase. Y una espera sin límite acá no la salva el `timeout` de
 * axios, porque ese cubre la PETICIÓN HTTP — y si el interceptor nunca termina, la petición
 * nunca llega a salir. La promesa no se resuelve jamás y la pantalla queda "Cargando…"
 * para siempre, sin un error en ningún lado.
 */
const ESPERA_SESION_MS = 2500;
const INTENTOS_SESION = 2;

/** Una promesa que no puede tardar más de lo que se le dice. */
function conLimite(promesa, ms) {
  let reloj;
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('la sesión no contestó')), ms); }),
  ]).finally(() => clearTimeout(reloj));
}

async function tokenDeLaSesion() {
  for (let intento = 0; intento < INTENTOS_SESION; intento++) {
    try {
      const { data: { session } } = await conLimite(supabase.auth.getSession(), ESPERA_SESION_MS);
      if (session?.access_token) return session.access_token;
    } catch (e) {
      console.warn('apiClient: no se pudo leer la sesión:', e?.message);
    }
    if (intento < INTENTOS_SESION - 1) await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

// Interceptor de REQUEST: Inyectar el Token JWT en cada petición
apiClient.interceptors.request.use(
  async (config) => {
    // ⚠️ UN PEDIDO SIN TOKEN ES UN 401 GARANTIZADO, Y UN 401 CIERRA LA SESIÓN.
    //
    // Acá antes, si `getSession()` fallaba o se colgaba, el pedido salía igual sin la
    // cabecera. El comentario decía que el 401 lo resolvía "un logout limpio" — y ese
    // logout es el que los dueños ven como "me pide usuario y contraseña de nuevo".
    //
    // Le pega sobre todo al ESCRITORIO: el refresco del token de Supabase puede tardar
    // hasta 30 segundos (10 s de timeout por intento, 3 intentos) y el mostrador consulta
    // cada 15. Un terminal prendido todo el día, con el internet de un gimnasio, cae en esa
    // ventana seguido. La web se abre, se usa y se cierra: casi no se expone.
    //
    // Ahora se insiste un poco —el refresco suele estar en curso, no perdido— y si aun así
    // no hay token, el pedido NO SALE. Falla como un error de red, que la app ya sabe
    // reintentar, en vez de quemar la sesión.
    const token = await tokenDeLaSesion();
    if (!token) {
      const sinSesion = new Error('No se pudo leer la sesión. Reintentando…');
      sinSesion.sinSesion = true;
      sinSesion.config = config;
      throw sinSesion;
    }
    config.headers.Authorization = `Bearer ${token}`;

    // Inyectar el Tenant seleccionado (Gimnasio).
    // Respeta un X-Tenant-ID seteado explícitamente por-request (ej: el Lobby, que
    // consulta la suscripción de CADA org del usuario). Sin este "&& !...", el
    // interceptor pisaría el header por-request con el del localStorage.
    const orgId = localStorage.getItem('current_org_id');
    if (orgId && !config.headers['X-Tenant-ID']) {
      config.headers['X-Tenant-ID'] = orgId;
    }

    // DNI de equipo (ADR-002): identifica ESTA instalación en cada escritura.
    // El backend lo estampa en origin_device_id (trazabilidad para el sync V3).
    const deviceId = getDeviceId();
    if (deviceId) {
      config.headers['X-Device-Id'] = deviceId;
    }

    // Quién está en el turno del mostrador. El backend lo estampa en cada registro que se
    // crea (performed_by_cashier_id), así que un cobro deja de ser anónimo: dice quién lo
    // hizo, no solo desde qué máquina. Ausente cuando no hay turno abierto — la web del
    // dueño, por ejemplo — y ahí el registro simplemente queda sin firma.
    const cashierId = getShiftId();
    if (cashierId) {
      config.headers['X-Cashier-Id'] = cashierId;
    }

    // Versión de la app (inyectada por Vite desde package.json): alimenta la señal
    // de vida del registro de equipos — la base del rollout por anillos (ADR-007).
    if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) {
      config.headers['X-App-Version'] = __APP_VERSION__;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Una página puede disparar varias requests en paralelo; si el token venció, TODAS
// vuelven 401 a la vez. Sin este guard se emitían N eventos 'auth-unauthorized' → N
// logouts encadenados (cada uno con su redirect+reload) → crash al cerrar sesión.
// No se resetea: el logout termina en una recarga completa de la app.
let unauthorizedHandled = false;

// Interceptor de RESPONSE: Manejar errores globales (ej: 401 Unauthorized, 402 Payment Required)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ── Reintento de errores de RED en métodos idempotentes ──
    // Un error de transporte NO trae `error.response` (a diferencia de un 4xx/5xx).
    const config = error.config;
    const isNetworkError = !error.response;
    const method = (config?.method || 'get').toLowerCase();
    if (config && isNetworkError && NETWORK_RETRY.methods.includes(method)) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < NETWORK_RETRY.maxRetries) {
        config.__retryCount += 1;
        const delay = Math.min(
          NETWORK_RETRY.baseDelayMs * 2 ** (config.__retryCount - 1),
          NETWORK_RETRY.maxDelayMs,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiClient(config);
      }
    }

    if (error.response && error.response.status === 401) {
      // ── Antes de cerrarle la sesión a nadie, se intenta renovarla UNA vez ──
      //
      // Un 401 no siempre significa "esta sesión murió": puede ser un token que venció
      // entre que el pedido salió y llegó. Cerrar la sesión ahí obliga a quien atiende a
      // buscar la contraseña con un socio esperando en el mostrador.
      //
      // Se intenta una sola vez y se marca el pedido, para que un token que el servidor
      // rechaza de verdad no entre en un ciclo infinito de renovar y reintentar.
      if (config && !config.__reintentoAuth) {
        config.__reintentoAuth = true;
        try {
          const { data } = await supabase.auth.refreshSession();
          if (data?.session?.access_token) {
            // No hace falta poner el token acá: al reintentar, el interceptor de request
            // vuelve a correr y lo toma ya renovado. Escribirlo a mano sería una línea
            // muerta que hace creer que el reintento depende de ella.
            return apiClient(config);
          }
        } catch {
          // La renovación tampoco pudo: es un cierre de sesión de verdad.
        }
      }

      if (!unauthorizedHandled) {
        unauthorizedHandled = true;
        // Token expirado o inválido, y la renovación no lo salvó: cerrar sesión.
        supabase.auth.signOut();

        // Emitir un evento global para que AuthContext reaccione (UNA sola vez)
        window.dispatchEvent(new Event('auth-unauthorized'));
      }
    } else if (error.response && error.response.status === 402) {
      // Kill Switch Activado: Sucursal inactiva por falta de pago
      window.dispatchEvent(new Event('auth-payment-required'));
    } else if (
      error.response &&
      error.response.status === 403 &&
      (error.response.data?.error === 'FORBIDDEN_TENANT' ||
       error.response.data?.error === 'DEVICE_BOUND_TO_OTHER_TENANT')
    ) {
      // Dos motivos distintos, misma cura: la sucursal que hay en el contexto no se puede
      // operar desde acá.
      //   · FORBIDDEN_TENANT            → la PERSONA perdió el acceso (la sacaron del equipo,
      //                                   o quedó un contexto viejo en localStorage).
      //   · DEVICE_BOUND_TO_OTHER_TENANT → el EQUIPO pertenece a otra sucursal (Fase 3):
      //                                   este terminal está atado y no es la que se pidió.
      // En los dos casos limpiamos el contexto y volvemos a la puerta de entrada, que en la
      // web es el Lobby y en el escritorio es DeviceGate — la misma ruta.
      localStorage.removeItem('current_org_id');
      localStorage.removeItem('current_org_name');
      window.dispatchEvent(new Event('auth-forbidden-tenant'));
    }
    
    // Extraer mensaje controlado de Java GlobalExceptionHandler
    if (error.response && error.response.data && error.response.data.message) {
      error.message = error.response.data.message;
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
