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
const NETWORK_RETRY = { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 3000, methods: ['get', 'head'] };

import { supabase } from './supabase';

// Interceptor de REQUEST: Inyectar el Token JWT en cada petición
apiClient.interceptors.request.use(
  async (config) => {
    // Obtener sesión activa de Supabase. Envuelto en try/catch: getSession() puede fallar o
    // colgarse por contención del lock de Supabase; si se propagara, rompería la request (y
    // podría disparar el ErrorBoundary). Ante fallo seguimos SIN token → el backend responde
    // 401 → lo maneja el interceptor de respuesta (logout limpio), sin crashear la UI.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn('apiClient: no se pudo obtener la sesión de Supabase:', e?.message);
    }

    // Inyectar el Tenant seleccionado (Gimnasio).
    // Respeta un X-Tenant-ID seteado explícitamente por-request (ej: el Lobby, que
    // consulta la suscripción de CADA org del usuario). Sin este "&& !...", el
    // interceptor pisaría el header por-request con el del localStorage.
    const orgId = localStorage.getItem('current_org_id');
    if (orgId && !config.headers['X-Tenant-ID']) {
      config.headers['X-Tenant-ID'] = orgId;
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
      if (!unauthorizedHandled) {
        unauthorizedHandled = true;
        // Token expirado o inválido: Forzar logout visual
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
      error.response.data?.error === 'FORBIDDEN_TENANT'
    ) {
      // El negocio seleccionado ya no es accesible (contexto viejo en localStorage,
      // o el usuario fue removido del equipo). Limpiamos y volvemos al Lobby.
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
