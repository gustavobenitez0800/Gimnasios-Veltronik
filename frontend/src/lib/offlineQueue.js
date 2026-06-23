// ============================================
// VELTRONIK V2 - COLA OFFLINE DE VENTAS (KIOSCO)
// ============================================
// Resiliencia a cortes de internet en el POS. Cuando una venta NO se puede enviar por falta de
// conexión (error de RED, no un rechazo del backend), se guarda acá y se reenvía sola al volver
// la conexión. El reenvío es IDEMPOTENTE por client_uuid: el backend devuelve la venta existente
// si ya había entrado, así que reintentar NUNCA duplica.
//
// Almacenamiento: localStorage (chico, sincrónico, sirve en web y en Electron). Las ventas en cola
// son payloads diminutos; suficiente para el caso "se cortó internet un rato".

const QUEUE_KEY = 'kiosk_offline_sales';
const CATALOG_KEY = 'kiosk_catalog_cache';

function read() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list)); } catch { /* almacenamiento lleno: best-effort */ }
}

export function getQueuedSales() {
  return read();
}

export function queuedCount() {
  return read().length;
}

/** Encola una venta (idempotente: no duplica por client_uuid). */
export function enqueueSale(payload) {
  const list = read();
  if (list.some((s) => s.clientUuid === payload.clientUuid)) return;
  list.push(payload);
  write(list);
}

function removeSale(clientUuid) {
  write(read().filter((s) => s.clientUuid !== clientUuid));
}

/**
 * Reenvía la cola. `registerFn` es kioskService.registerSale (idempotente por client_uuid).
 * - Éxito (incluye replay de una venta ya registrada) → se saca de la cola.
 * - Error de RED (sin respuesta) → corta y reintenta en la próxima (sigue sin conexión).
 * - Rechazo del backend (4xx/5xx con respuesta) → la saca de la cola para no trabar el resto
 *   (caso de borde raro en cortes breves; v1). Devuelve {synced, failed}.
 */
export async function flushQueuedSales(registerFn) {
  let synced = 0, failed = 0;
  for (const sale of read()) {
    try {
      await registerFn(sale);
      removeSale(sale.clientUuid);
      synced++;
    } catch (err) {
      if (!err?.response) break;   // sin conexión todavía → dejá el resto para después
      removeSale(sale.clientUuid); // el backend la rechazó → no bloquees la cola
      failed++;
    }
  }
  return { synced, failed };
}

// ─── Cache del catálogo (para que el POS abra y escanee durante un corte) ───

export function cacheCatalog(products) {
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(products)); } catch { /* best-effort */ }
}

export function getCachedCatalog() {
  try { return JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null'); } catch { return null; }
}

/** ¿El error de axios es por falta de conexión (sin respuesta del server) y no un rechazo HTTP? */
export function isNetworkError(err) {
  return !!err && !err.response;
}
