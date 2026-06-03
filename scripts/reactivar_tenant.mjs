/**
 * Reactivación manual SEGURA — Plan B para cuando el webhook de MP no aplicó un cobro
 * que YA ESTÁ APROBADO en Mercado Pago.
 *
 * RIGOR TIPO NETFLIX: esta herramienta JAMÁS otorga acceso a ciegas. Verifica contra
 * Mercado Pago que el pago exista y esté 'approved' ANTES de tocar la base de datos.
 * (La versión vieja daba 30 días sin verificar el pago — eso habilitó a un cliente cuyo
 *  cobro había sido RECHAZADO. Esto lo cierra de raíz.)
 *
 *   node reactivar_tenant.mjs "<nombre|id del tenant>" --payment <mp_payment_id>            -> DRY-RUN (verifica y muestra)
 *   node reactivar_tenant.mjs "<nombre|id del tenant>" --payment <mp_payment_id> --commit   -> aplica (solo si approved)
 *
 * Requiere DB_URL y MP_ACCESS_TOKEN (token PROD) en scripts/.env. Correr con:
 *   node --env-file=scripts/.env scripts/reactivar_tenant.mjs "POPEYE GYM" --payment 12345678901
 *
 * Garantías:
 *  - Sin --payment NO hace nada (no existen más reactivaciones a ciegas).
 *  - GET /v1/payments/<id>: exige status='approved'; cualquier otro estado → REHÚSA.
 *  - Si el pago trae external_reference y no coincide con el tenant → REHÚSA (seguridad).
 *  - Idempotente por mp_payment_id (no duplica el cobro).
 *  - Espeja exactamente lo que hace el webhook (applyApprovedPayment): registra el cobro,
 *    pone la suscripción 'active' y extiende el período/acceso 30 días (sin recortar uno mayor).
 */
import pg from 'pg';
const { Client } = pg;

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const pIdx = args.indexOf('--payment');
const PAYMENT_ID = pIdx >= 0 ? args[pIdx + 1] : null;
const TARGET = args.find((a, i) => !a.startsWith('--') && (pIdx < 0 || i !== pIdx + 1));

const DB = process.env.DB_URL;
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (msg) => { console.error('❌ ' + msg); process.exit(1); };

if (!TARGET) fail('Falta el tenant. Uso: node reactivar_tenant.mjs "<nombre|id>" --payment <mp_payment_id> [--commit]');
if (!PAYMENT_ID) fail('Falta --payment <mp_payment_id>. Esta herramienta NO reactiva sin un pago real APROBADO en Mercado Pago.');
if (!DB) fail('Falta DB_URL en el entorno (scripts/.env).');
if (!MP_TOKEN) fail('Falta MP_ACCESS_TOKEN en el entorno (scripts/.env).');

const c = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
const NOW_AR = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')`;

const snapshot = (id) => c.query(`
  SELECT t.is_active, to_char(t.trial_ends_at,'YYYY-MM-DD HH24:MI') trial,
         s.status, to_char(s.current_period_end,'YYYY-MM-DD HH24:MI') period_end
    FROM public.tenant t
    LEFT JOIN LATERAL (SELECT * FROM public.subscriptions s2 WHERE s2.tenant_id=t.id ORDER BY created_at DESC LIMIT 1) s ON true
   WHERE t.id=$1`, [id]).then(r => r.rows[0]);

const run = async () => {
  await c.connect();

  // 1) Resolver el tenant por id (UUID) o por nombre (ILIKE, debe haber exactamente 1).
  let tenant;
  if (UUID_RE.test(TARGET)) {
    tenant = (await c.query(`SELECT id, name FROM public.tenant WHERE id=$1`, [TARGET])).rows[0];
  } else {
    const rows = (await c.query(`SELECT id, name FROM public.tenant WHERE name ILIKE $1`, [`%${TARGET}%`])).rows;
    if (rows.length > 1) { await c.end(); fail(`"${TARGET}" coincide con ${rows.length} negocios (${rows.map(r => r.name).join(', ')}). Usá el nombre exacto o el id.`); }
    tenant = rows[0];
  }
  if (!tenant) { await c.end(); fail(`No existe un negocio que coincida con "${TARGET}".`); }
  console.log(`Tenant: ${tenant.name} (${tenant.id}) — Modo: ${COMMIT ? '🔴 COMMIT' : '🟢 DRY-RUN'}`);

  // 2) VERIFICAR el pago en Mercado Pago (fuente de verdad).
  console.log(`Verificando pago ${PAYMENT_ID} en Mercado Pago...`);
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${PAYMENT_ID}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    await c.end();
    fail(`Mercado Pago no devolvió el pago ${PAYMENT_ID} (HTTP ${resp.status}). NO se reactiva. ${body.slice(0, 200)}`);
  }
  const pay = await resp.json();
  const amount = pay.transaction_amount;
  const extRef = pay.external_reference;
  const preapprovalId = pay?.metadata?.preapproval_id || null;
  console.log(`  → status=${pay.status}, detail=${pay.status_detail}, amount=${amount}, external_reference=${extRef || '(vacío)'}`);

  // 3) GATE de oro: SOLO 'approved' otorga acceso.
  if (pay.status !== 'approved') {
    await c.end();
    fail(`El pago ${PAYMENT_ID} está '${pay.status}' (${pay.status_detail}), NO 'approved'. NO se reactiva: el acceso solo se da con un cobro aprobado.`);
  }
  // 4) Si el pago declara a qué tenant pertenece, debe coincidir.
  if (extRef && extRef !== tenant.id) {
    await c.end();
    fail(`El pago ${PAYMENT_ID} pertenece al tenant ${extRef}, no a ${tenant.id}. NO se reactiva (mismatch de seguridad).`);
  }
  if (!extRef) console.log('  ⚠️  El pago no trae external_reference (cobro recurrente): se aplica al tenant indicado.');

  console.log('ANTES:', await snapshot(tenant.id));

  if (!COMMIT) {
    console.log(`\n🟢 DRY-RUN: pago APROBADO ✔. Con --commit registraría el cobro y daría acceso 30 días.`);
    await c.end(); return;
  }

  // 5) APLICAR en una transacción. Idempotente por mp_payment_id.
  await c.query('BEGIN');
  try {
    const dup = (await c.query(`SELECT 1 FROM public.tenant_payment WHERE mp_payment_id=$1`, [PAYMENT_ID])).rowCount > 0;
    if (dup) {
      console.log(`ℹ️  El pago ${PAYMENT_ID} ya estaba registrado (idempotencia): no se duplica.`);
    } else {
      await c.query(`
        INSERT INTO public.tenant_payment (id, created_at, updated_at, tenant_id, mp_payment_id, mp_preapproval_id, amount, status, payment_date)
        VALUES (gen_random_uuid(), now(), now(), $1, $2, $3, $4, 'APPROVED', ${NOW_AR})`,
        [tenant.id, PAYMENT_ID, preapprovalId, amount ?? 0]);
    }

    // Suscripción: 'active' + período = max(período actual, hoy+30d) (no recorta uno mayor vigente).
    const subUpd = await c.query(`
      UPDATE public.subscriptions SET
        status='active',
        current_period_start=${NOW_AR},
        current_period_end   = GREATEST(COALESCE(current_period_end, ${NOW_AR}), ${NOW_AR} + interval '30 days'),
        grace_period_ends_at = GREATEST(COALESCE(current_period_end, ${NOW_AR}), ${NOW_AR} + interval '30 days') + interval '3 days',
        last_charge_status='approved', last_charge_detail=NULL, last_charge_at=${NOW_AR}, updated_at=now()
      WHERE id=(SELECT id FROM public.subscriptions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1)`, [tenant.id]);
    if (subUpd.rowCount === 0) console.log('  ⚠️  El tenant no tenía suscripción local: el acceso queda por trial_ends_at.');

    // Tenant: activo + trial_ends_at = max(actual, hoy+30d).
    await c.query(`
      UPDATE public.tenant SET is_active=true,
        trial_ends_at = GREATEST(COALESCE(trial_ends_at, ${NOW_AR}), ${NOW_AR} + interval '30 days'), updated_at=now()
      WHERE id=$1`, [tenant.id]);

    await c.query('COMMIT');
    console.log('✅ COMMIT aplicado (pago verificado approved). DESPUÉS:', await snapshot(tenant.id));
  } catch (e) {
    await c.query('ROLLBACK');
    fail('Error aplicando, rollback: ' + e.message);
  } finally {
    await c.end();
  }
};
run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
