/**
 * Reconcilia las suscripciones (preapprovals) de Mercado Pago.
 *
 * EL PROBLEMA: cada vez que un cliente pagaba / cambiaba tarjeta / reactivaba, la app creaba
 * un preapproval NUEVO sin dar de baja el anterior → varias suscripciones ACTIVAS por cliente
 * cobrando en paralelo (los "cobros repetidos"). El fix del backend ya evita que se acumulen
 * NUEVOS; este script limpia los que YA quedaron duplicados.
 *
 * Qué hace: lista todas las suscripciones de la cuenta MP, las agrupa por external_reference
 * (= tenant), y por cada tenant CONSERVA la autorizada más reciente y CANCELA las sobrantes.
 *
 * SEGURO POR DEFECTO: corre en DRY-RUN (solo muestra qué haría, NO cancela nada).
 * Para aplicar de verdad, pasá --commit. Revisá SIEMPRE la salida del dry-run antes.
 *
 * Requisitos: Node 18+ (fetch nativo).
 *
 * Uso (PowerShell):
 *   $env:MP_ACCESS_TOKEN="APP_USR-..."                    # MISMO token productivo de Railway
 *   node scripts/reconciliar_preapprovals.mjs             # DRY-RUN (no cancela nada)
 *   node scripts/reconciliar_preapprovals.mjs --commit    # cancela las duplicadas
 */

const TOKEN = process.env.MP_ACCESS_TOKEN;
const COMMIT = process.argv.includes('--commit');
const API = 'https://api.mercadopago.com';

if (typeof fetch !== 'function') { console.error('Necesitás Node 18+ (fetch nativo).'); process.exit(1); }
if (!TOKEN) {
  console.error('Falta MP_ACCESS_TOKEN. Ponelo con el token productivo de Railway:');
  console.error('  $env:MP_ACCESS_TOKEN="APP_USR-..."');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

/** Trae TODOS los preapprovals de la cuenta (paginado). */
async function searchAll() {
  const all = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const resp = await fetch(`${API}/preapproval/search?limit=${limit}&offset=${offset}`, { headers });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`search HTTP ${resp.status}: ${JSON.stringify(data)}`);
    const results = data.results || [];
    all.push(...results);
    const total = data.paging?.total ?? all.length;
    offset += limit;
    if (offset >= total || results.length === 0) break;
  }
  return all;
}

async function cancel(id) {
  const resp = await fetch(`${API}/preapproval/${id}`, {
    method: 'PUT', headers, body: JSON.stringify({ status: 'cancelled' }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  return true;
}

const run = async () => {
  console.log(COMMIT
    ? '== MODO COMMIT: se cancelarán las suscripciones duplicadas =='
    : '== DRY-RUN: no se cancela nada (corré con --commit para aplicar) ==');

  const all = await searchAll();
  console.log(`Total de suscripciones en la cuenta MP: ${all.length}\n`);

  // Agrupar por external_reference (tenant).
  const byRef = new Map();
  for (const p of all) {
    const ref = p.external_reference || '(sin-referencia)';
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(p);
  }

  const toCancel = [];
  for (const [ref, list] of byRef) {
    // "Vivas" = las que pueden cobrar (authorized o pending). El resto ya está dado de baja.
    const alive = list.filter(p => p.status === 'authorized' || p.status === 'pending');
    if (alive.length <= 1) continue; // 0 o 1 viva → no hay duplicado

    const authorized = alive
      .filter(p => p.status === 'authorized')
      .sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    // Conservar la autorizada más reciente; si no hay autorizadas, la pending más reciente.
    const keep = authorized[0] || alive.slice().sort((a, b) => new Date(b.date_created) - new Date(a.date_created))[0];
    const extras = alive.filter(p => p.id !== keep.id);
    if (extras.length === 0) continue;

    console.log(`Tenant ${ref}: ${alive.length} suscripciones vivas`);
    console.log(`   CONSERVAR  ${keep.id} (${keep.status}, creada ${keep.date_created})`);
    for (const e of extras) {
      console.log(`   CANCELAR   ${e.id} (${e.status}, creada ${e.date_created})`);
      toCancel.push(e.id);
    }
    console.log('');
  }

  if (toCancel.length === 0) { console.log('No se encontraron duplicados. Todo en orden.'); return; }

  console.log(`Suscripciones duplicadas a cancelar: ${toCancel.length}`);
  if (!COMMIT) { console.log('DRY-RUN: no se canceló nada. Revisá la lista y corré con --commit para aplicar.'); return; }

  let ok = 0;
  for (const id of toCancel) {
    try { await cancel(id); ok++; console.log(`cancelada ${id}`); }
    catch (e) { console.error(`ERROR cancelando ${id}: ${e.message}`); }
  }
  console.log(`\nListo: ${ok}/${toCancel.length} canceladas.`);
};

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
