// ============================================
// VELTRONIK - DNI DE EQUIPO (ADR-002, Fase 0 V3)
// ============================================
// Identificador único y persistente de ESTA instalación. Viaja en cada request
// como header X-Device-Id y el backend lo estampa en cada registro que se crea
// (origin_device_id): trazabilidad de qué equipo originó qué dato.
//
// v0 (Fase 0): persiste en localStorage — sobrevive reinicios y updates de la
// app, se pierde si se borra el perfil. Suficiente para empezar a poblar la
// procedencia. En la Fase 1 (enrolamiento) se reemplaza por una identidad
// atada a la máquina emitida al enrolar; este módulo es el único lugar a tocar.

const STORAGE_KEY = 'veltronik_device_id';

/** UUID v4 con fallback para contextos sin crypto.randomUUID (webviews viejas). */
function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback RFC4122-ish sobre getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Devuelve el DNI de este equipo, generándolo la primera vez. */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage inaccesible (modo privado extremo): sin DNI esta sesión.
    // La operación NUNCA se bloquea por falta de procedencia (ADR-003).
    return null;
  }
}
