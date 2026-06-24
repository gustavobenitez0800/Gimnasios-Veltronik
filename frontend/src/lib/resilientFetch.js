// ============================================
// VELTRONIK - RESILIENT FETCH (capa de infraestructura)
// ============================================
// Decorador de `fetch` con timeout por intento + reintentos con backoff
// exponencial y jitter. Sin dependencias y agnóstico del dominio: se compone
// sobre cualquier implementación de `fetch`.
//
// POR QUÉ EXISTE
// El login es el ÚNICO punto de la app que habla DIRECTO con Supabase (el resto
// pasa por el backend Java). El cliente Supabase se creaba sin opciones, o sea:
//   - sin timeout  → ante un cuelgue de red la petición quedaba colgada para siempre
//                    y el usuario percibía la app trabada;
//   - sin reintento → un solo parpadeo de red = "Error de conexión" en el login.
// Esta capa absorbe los fallos transitorios y ACOTA el tiempo máximo de espera,
// sin cambiar la semántica del `fetch` (entra y sale un Response estándar).

const DEFAULTS = {
  timeoutMs: 10000, // corte por intento (vía AbortController)
  retries: 2, // reintentos ADICIONALES → 3 intentos en total
  baseDelayMs: 500, // backoff base
  maxDelayMs: 4000, // techo del backoff
  // Estados HTTP que tiene sentido reintentar: servidor temporalmente no disponible
  // o rate-limit. NUNCA reintentamos 4xx de negocio (400/401 = credenciales inválidas).
  retryableStatuses: [408, 429, 502, 503, 504],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff exponencial con jitter (±25%), acotado por maxDelayMs. */
function backoffDelay(attempt, baseDelayMs, maxDelayMs) {
  const exp = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const jitter = exp * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

/** Respeta el header Retry-After (segundos o fecha HTTP) si el server lo manda. */
function parseRetryAfter(response, maxDelayMs) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return null;
  const secs = Number(raw);
  if (!Number.isNaN(secs)) return Math.min(secs * 1000, maxDelayMs * 2);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), maxDelayMs * 2));
  return null;
}

/**
 * Combina el signal del llamador (si lo hay) con el de nuestro timeout, de modo que
 * abortar cualquiera de los dos aborte la petición. Devuelve también un `cleanup`
 * para soltar los listeners y no fugar memoria.
 */
function combineSignals(signals) {
  const valid = signals.filter(Boolean);
  if (valid.length === 0) return { signal: undefined, cleanup() {} };
  if (valid.length === 1) return { signal: valid[0], cleanup() {} };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(valid), cleanup() {} };
  }
  const controller = new AbortController();
  const onAbort = (event) => controller.abort(event?.target?.reason);
  for (const s of valid) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', onAbort);
  }
  return {
    signal: controller.signal,
    cleanup() {
      for (const s of valid) s.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Crea un `fetch` resiliente.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retries]
 * @param {number} [options.baseDelayMs]
 * @param {number} [options.maxDelayMs]
 * @param {number[]} [options.retryableStatuses]
 * @param {(info: {attempt:number, error?:Error, status?:number, delay:number}) => void} [options.onRetry]
 * @param {typeof fetch} [options.fetchImpl] - fetch base (default: global fetch).
 * @returns {typeof fetch}
 */
export function createResilientFetch(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl || ((...args) => fetch(...args));

  return async function resilientFetch(input, init = {}) {
    const callerSignal = init.signal;
    let lastError = null;

    for (let attempt = 0; attempt <= cfg.retries; attempt += 1) {
      // Si el llamador ya canceló (ej: Supabase abortó su propio request), respetamos
      // la cancelación y no insistimos.
      if (callerSignal?.aborted) throw callerSignal.reason ?? new DOMException('Aborted', 'AbortError');

      const timeoutController = new AbortController();
      const timer = setTimeout(
        () => timeoutController.abort(new DOMException(`Request timeout after ${cfg.timeoutMs}ms`, 'TimeoutError')),
        cfg.timeoutMs,
      );
      const combined = combineSignals([callerSignal, timeoutController.signal]);

      try {
        const response = await fetchImpl(input, { ...init, signal: combined.signal });

        // Respuesta HTTP recibida. ¿Es un estado transitorio reintentable?
        if (cfg.retryableStatuses.includes(response.status) && attempt < cfg.retries) {
          const retryAfter = parseRetryAfter(response, cfg.maxDelayMs);
          const delay = retryAfter ?? backoffDelay(attempt, cfg.baseDelayMs, cfg.maxDelayMs);
          cfg.onRetry?.({ attempt: attempt + 1, status: response.status, delay });
          await sleep(delay);
          continue;
        }
        return response;
      } catch (error) {
        // El llamador canceló (no fue nuestro timeout): propagar sin reintentar.
        if (callerSignal?.aborted) throw error;

        // Nuestro timeout disparó: normalizamos a un Error con 'timeout' en el mensaje
        // para que el mapeo de errores lo muestre como "tardó demasiado".
        lastError = timeoutController.signal.aborted
          ? new Error(`Request timeout after ${cfg.timeoutMs}ms`)
          : error;

        if (attempt < cfg.retries) {
          const delay = backoffDelay(attempt, cfg.baseDelayMs, cfg.maxDelayMs);
          cfg.onRetry?.({ attempt: attempt + 1, error: lastError, delay });
          await sleep(delay);
          continue;
        }
        // Agotados los reintentos: propagamos el último error TAL CUAL (preserva
        // "Failed to fetch") para que el ErrorService lo mapee correctamente.
        throw lastError;
      } finally {
        clearTimeout(timer);
        combined.cleanup();
      }
    }

    // Inalcanzable en la práctica; defensa por si retries < 0.
    throw lastError ?? new Error('resilientFetch: agotado sin respuesta');
  };
}

export default createResilientFetch;
