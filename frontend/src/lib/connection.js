// ============================================
// VELTRONIK - CONNECTION RESOLVER (la válvula, V3 ladrillo 6)
// ============================================
// Decide contra QUÉ backend habla la app: la nube (default, todos los clientes
// de hoy) o el CEREBRO LOCAL embebido cuando corre en este equipo.
//
// SEGURIDAD: solo entra en modo local si estamos en Electron Y el cerebro local
// responde /api/local/status con ready=true. Un navegador web o un Electron sin
// cerebro (el 100% de la calle hoy) nunca cambia — se queda en la nube.

const CLOUD_API_BASE = import.meta.env.VITE_API_BASE_URL;
// El cerebro local escucha en 127.0.0.1:47810 (ADR-009, application-local.properties).
const LOCAL_ROOT = 'http://127.0.0.1:47810';
const LOCAL_API_BASE = `${LOCAL_ROOT}/api`;

let state = { mode: 'cloud', apiBase: CLOUD_API_BASE, tenantId: null };

function inElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/** Probe corto al cerebro local. Falla rápido (connection refused es inmediato). */
async function probeLocalBrain() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${LOCAL_ROOT}/api/local/status`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json();
    const data = body?.data ?? body;
    return data?.ready ? data : null;
  } catch {
    return null; // sin cerebro local (refused/timeout) → nube
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resuelve la conexión UNA vez, al arrancar (main.jsx la espera antes de renderizar).
 * Idempotente en la práctica: si algo falla, queda en nube.
 */
export async function initConnection() {
  if (inElectron()) {
    const local = await probeLocalBrain();
    if (local) {
      state = { mode: 'local', apiBase: LOCAL_API_BASE, tenantId: local.tenantId || null };
      return state;
    }
  }
  state = { mode: 'cloud', apiBase: CLOUD_API_BASE, tenantId: null };
  return state;
}

export function isLocalMode() {
  return state.mode === 'local';
}

/** Base del API vigente (la usa el interceptor del apiClient en cada request). */
export function getApiBase() {
  return state.apiBase;
}

export function getLocalTenantId() {
  return state.tenantId;
}
