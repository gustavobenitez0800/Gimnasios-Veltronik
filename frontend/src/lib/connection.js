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
    // El cerebro local bootea MÁS LENTO que la app (Spring + Postgres embebido: 15s;
    // el primer arranque con initdb, más). Si este equipo debería tenerlo (enrolado),
    // seguimos probando en background: sin esto, un arranque SIN internet quedaba
    // clavado en una pantalla de login de nube que no puede funcionar, hasta reiniciar.
    scheduleLocalBrainRetry();
  }
  state = { mode: 'cloud', apiBase: CLOUD_API_BASE, tenantId: null };
  return state;
}

/**
 * Re-probe en background para el equipo enrolado cuyo cerebro todavía estaba booteando.
 * Cuando el cerebro responde ready, se recarga la app SOLO si nadie inició sesión de
 * nube (el caso real: terminal de cajero sin internet). A un usuario activo en modo
 * nube jamás se le recarga la pantalla.
 */
async function scheduleLocalBrainRetry() {
  try {
    const shouldHaveBrain = await window.electronAPI?.localBrain?.isEnabled?.();
    if (!shouldHaveBrain) return; // equipo no enrolado: nunca va a haber cerebro
  } catch {
    return; // preload viejo sin isEnabled: comportamiento anterior (solo nube)
  }

  const RETRY_MS = 3000;
  const DEADLINE = Date.now() + 150000; // ventana generosa: cubre el primer initdb
  const tick = async () => {
    if (Date.now() > DEADLINE) return;
    const local = await probeLocalBrain();
    if (!local) {
      setTimeout(tick, RETRY_MS);
      return;
    }
    // Cerebro listo. ¿Hay una sesión de NUBE activa? → no molestar (seguirá en nube).
    try {
      const { supabase } = await import('./supabase');
      const { data } = await supabase.auth.getSession();
      if (data?.session) return;
    } catch { /* sin señal de sesión → tratamos como sin sesión */ }
    window.location.reload(); // rearranca y el probe inicial entra directo al modo local
  };
  setTimeout(tick, RETRY_MS);
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
