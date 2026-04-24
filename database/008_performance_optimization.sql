-- ============================================
-- VELTRONIK - MIGRACIÓN 008: OPTIMIZACIÓN DE RENDIMIENTO
-- ============================================
-- Fecha: 2026-04-24
-- Descripción:
--   Esta migración prepara la base de datos para soportar
--   gran volumen de datos y múltiples organizaciones simultáneas.
--
-- INCLUYE:
--   1. Índices compuestos faltantes en tablas de alto volumen
--   2. Índices parciales para queries frecuentes
--   3. Particionamiento lógico (archivado) de access_logs
--   4. Vistas Materializadas para dashboard y reportes instantáneos
--   5. Función automática para refrescar vistas
--   6. Índices en tablas de restaurante que faltaban
--
-- SEGURIDAD: Todos los cambios son no-destructivos.
--            Usan IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================

-- ═══════════════════════════════════════
-- 1. ÍNDICES COMPUESTOS FALTANTES
-- ═══════════════════════════════════════
-- Estos índices aceleran las consultas más comunes:
-- cuando un negocio filtra sus propios datos por fecha.

-- members: buscar socios activos por organización
CREATE INDEX IF NOT EXISTS idx_members_gym_status
  ON members(gym_id, status);

CREATE INDEX IF NOT EXISTS idx_members_gym_membership_end
  ON members(gym_id, membership_end)
  WHERE membership_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_gym_name
  ON members(gym_id, full_name);

-- member_payments: filtrar pagos por org + fecha (reportes)
CREATE INDEX IF NOT EXISTS idx_payments_gym_date
  ON member_payments(gym_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_gym_status_date
  ON member_payments(gym_id, status, payment_date DESC);

-- access_logs: filtrar por org + fecha (diario de accesos)
CREATE INDEX IF NOT EXISTS idx_access_gym_checkin_desc
  ON access_logs(gym_id, check_in_at DESC);

-- classes: buscar por org + estado
CREATE INDEX IF NOT EXISTS idx_classes_gym_status
  ON classes(gym_id, status);

-- class_bookings: buscar por org + fecha
CREATE INDEX IF NOT EXISTS idx_bookings_gym_date
  ON class_bookings(gym_id, booking_date);

-- subscriptions: buscar suscripción activa por org (más frecuente)
CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_status
  ON subscriptions(gym_id, status);

-- audit_log: ya tiene idx_audit_org_date, añadir por entity_type
CREATE INDEX IF NOT EXISTS idx_audit_org_entity
  ON audit_log(organization_id, entity_type, created_at DESC);

-- ═══════════════════════════════════════
-- 2. ÍNDICES PARCIALES (PARTIAL INDEXES)
-- ═══════════════════════════════════════
-- Indexan solo filas relevantes, pesan menos y son más rápidos.

-- Solo socios activos (la query más frecuente)
CREATE INDEX IF NOT EXISTS idx_members_active_only
  ON members(gym_id)
  WHERE status = 'active';

-- Solo pagos pagados (para calcular ingresos)
CREATE INDEX IF NOT EXISTS idx_payments_paid_only
  ON member_payments(gym_id, payment_date)
  WHERE status = 'paid';

-- Solo suscripciones activas
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_only
  ON subscriptions(gym_id)
  WHERE status = 'active';

-- access_logs de hoy sin checkout (usuarios adentro ahora)
CREATE INDEX IF NOT EXISTS idx_access_currently_in
  ON access_logs(gym_id, check_in_at DESC)
  WHERE check_out_at IS NULL;

-- ═══════════════════════════════════════
-- 3. ÍNDICES PARA TABLAS DE RESTAURANTE
-- ═══════════════════════════════════════
-- Las tablas de restaurante ya tienen algunos, pero faltan los compuestos.

CREATE INDEX IF NOT EXISTS idx_orders_org_created
  ON restaurant_orders(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_org_payment_status
  ON restaurant_orders(org_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_menu_items_org_available
  ON menu_items(org_id, is_available, sort_order);

CREATE INDEX IF NOT EXISTS idx_reservations_org_date_status
  ON reservations(org_id, reservation_date, status);

CREATE INDEX IF NOT EXISTS idx_cash_org_opened
  ON cash_register(org_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_org_stock
  ON inventory_items(org_id, current_stock)
  WHERE current_stock <= minimum_stock;

-- ═══════════════════════════════════════
-- 4. VISTAS MATERIALIZADAS
-- ═══════════════════════════════════════
-- Estas vistas pre-calculan datos pesados para que el dashboard
-- y los reportes carguen instantáneamente. Se refrescan periódicamente.

-- 4A. Resumen mensual de ingresos por organización
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_revenue AS
SELECT
  mp.gym_id AS org_id,
  DATE_TRUNC('month', mp.payment_date) AS month,
  COUNT(*) AS payment_count,
  SUM(mp.amount) AS total_revenue,
  COUNT(DISTINCT mp.member_id) AS unique_payers,
  -- Desglose por método de pago
  SUM(CASE WHEN mp.payment_method = 'cash' THEN mp.amount ELSE 0 END) AS cash_total,
  SUM(CASE WHEN mp.payment_method = 'transfer' THEN mp.amount ELSE 0 END) AS transfer_total,
  SUM(CASE WHEN mp.payment_method = 'card' THEN mp.amount ELSE 0 END) AS card_total,
  SUM(CASE WHEN mp.payment_method = 'mercadopago' THEN mp.amount ELSE 0 END) AS mp_total
FROM member_payments mp
WHERE mp.status = 'paid'
GROUP BY mp.gym_id, DATE_TRUNC('month', mp.payment_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_revenue_pk
  ON mv_monthly_revenue(org_id, month);

-- 4B. Resumen de estado de socios por organización
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_member_stats AS
SELECT
  m.gym_id AS org_id,
  COUNT(*) AS total_members,
  COUNT(*) FILTER (WHERE m.status = 'active') AS active_members,
  COUNT(*) FILTER (WHERE m.status = 'inactive') AS inactive_members,
  COUNT(*) FILTER (WHERE m.status = 'suspended') AS suspended_members,
  -- Membresías vencidas (activos con fecha pasada)
  COUNT(*) FILTER (
    WHERE m.membership_end IS NOT NULL
    AND m.membership_end < CURRENT_DATE
  ) AS expired_members,
  -- Vencen esta semana
  COUNT(*) FILTER (
    WHERE m.membership_end IS NOT NULL
    AND m.membership_end >= CURRENT_DATE
    AND m.membership_end <= CURRENT_DATE + INTERVAL '7 days'
  ) AS expiring_this_week,
  -- Vencen en 3 días
  COUNT(*) FILTER (
    WHERE m.membership_end IS NOT NULL
    AND m.membership_end >= CURRENT_DATE
    AND m.membership_end <= CURRENT_DATE + INTERVAL '3 days'
  ) AS expiring_3_days,
  -- Nuevos socios este mes
  COUNT(*) FILTER (
    WHERE m.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ) AS new_this_month
FROM members m
GROUP BY m.gym_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_member_stats_pk
  ON mv_member_stats(org_id);

-- 4C. Accesos diarios (resumen por día por org)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_access AS
SELECT
  al.gym_id AS org_id,
  DATE(al.check_in_at) AS access_date,
  COUNT(*) AS total_checkins,
  COUNT(DISTINCT al.member_id) AS unique_members,
  COUNT(al.check_out_at) AS total_checkouts
FROM access_logs al
WHERE al.check_in_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY al.gym_id, DATE(al.check_in_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_access_pk
  ON mv_daily_access(org_id, access_date);

-- 4D. Resumen para restaurantes: ingresos diarios
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_restaurant_daily_revenue AS
SELECT
  ro.org_id,
  DATE(ro.created_at) AS order_date,
  COUNT(*) AS total_orders,
  SUM(ro.total) AS total_revenue,
  SUM(ro.tip) AS total_tips,
  AVG(ro.total) AS avg_ticket,
  COUNT(DISTINCT ro.table_id) AS tables_served,
  -- Desglose por tipo de pedido
  COUNT(*) FILTER (WHERE ro.order_type = 'dine_in') AS dine_in_count,
  COUNT(*) FILTER (WHERE ro.order_type = 'takeaway') AS takeaway_count,
  COUNT(*) FILTER (WHERE ro.order_type = 'delivery') AS delivery_count
FROM restaurant_orders ro
WHERE ro.status IN ('completed', 'paid')
  AND ro.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY ro.org_id, DATE(ro.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_resto_daily_pk
  ON mv_restaurant_daily_revenue(org_id, order_date);

-- ═══════════════════════════════════════
-- 5. FUNCIONES PARA REFRESCAR VISTAS
-- ═══════════════════════════════════════

-- Refrescar todas las vistas materializadas (se llama desde un cron o manualmente)
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_member_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_access;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_restaurant_daily_revenue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refrescar solo las vistas de un tipo específico (más granular)
CREATE OR REPLACE FUNCTION refresh_org_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_member_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 6. RPC PARA DASHBOARD OPTIMIZADO
-- ═══════════════════════════════════════
-- En vez de que el frontend haga 3+ queries, hace 1 sola.

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  member_data RECORD;
  revenue_data RECORD;
  access_today INT;
BEGIN
  -- Stats de socios desde vista materializada
  SELECT * INTO member_data
  FROM mv_member_stats
  WHERE org_id = p_org_id;

  -- Ingresos del mes actual desde vista materializada
  SELECT
    COALESCE(total_revenue, 0) AS monthly_revenue,
    COALESCE(payment_count, 0) AS monthly_payments
  INTO revenue_data
  FROM mv_monthly_revenue
  WHERE org_id = p_org_id
    AND month = DATE_TRUNC('month', CURRENT_DATE);

  -- Accesos de hoy (esto sí es en tiempo real, es una query pequeña)
  SELECT COUNT(*) INTO access_today
  FROM access_logs
  WHERE gym_id = p_org_id
    AND check_in_at >= CURRENT_DATE;

  result := json_build_object(
    'total_members', COALESCE(member_data.total_members, 0),
    'active_members', COALESCE(member_data.active_members, 0),
    'inactive_members', COALESCE(member_data.inactive_members, 0),
    'expired_members', COALESCE(member_data.expired_members, 0),
    'expiring_this_week', COALESCE(member_data.expiring_this_week, 0),
    'expiring_3_days', COALESCE(member_data.expiring_3_days, 0),
    'new_this_month', COALESCE(member_data.new_this_month, 0),
    'monthly_revenue', COALESCE(revenue_data.monthly_revenue, 0),
    'monthly_payments', COALESCE(revenue_data.monthly_payments, 0),
    'access_today', access_today
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC para datos de gráficos (ingresos de últimos N meses)
CREATE OR REPLACE FUNCTION get_revenue_chart(p_org_id UUID, p_months INT DEFAULT 6)
RETURNS TABLE (
  month TEXT,
  total_revenue DECIMAL,
  payment_count BIGINT,
  unique_payers BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(mr.month, 'Mon') AS month,
    mr.total_revenue,
    mr.payment_count,
    mr.unique_payers
  FROM mv_monthly_revenue mr
  WHERE mr.org_id = p_org_id
    AND mr.month >= DATE_TRUNC('month', CURRENT_DATE) - (p_months || ' months')::INTERVAL
  ORDER BY mr.month ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 7. ARCHIVADO AUTOMÁTICO DE ACCESS_LOGS
-- ═══════════════════════════════════════
-- En lugar de particionamiento (que requiere recrear la tabla),
-- usamos una tabla de archivo y una función de limpieza.

CREATE TABLE IF NOT EXISTS access_logs_archive (
  LIKE access_logs INCLUDING ALL
);

-- Mover registros viejos (>6 meses) al archivo
CREATE OR REPLACE FUNCTION archive_old_access_logs()
RETURNS INT AS $$
DECLARE
  archived_count INT;
BEGIN
  WITH moved AS (
    DELETE FROM access_logs
    WHERE check_in_at < CURRENT_DATE - INTERVAL '6 months'
    RETURNING *
  )
  INSERT INTO access_logs_archive
  SELECT * FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Archivado para audit_log (>3 meses)
CREATE TABLE IF NOT EXISTS audit_log_archive (
  LIKE audit_log INCLUDING ALL
);

CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS INT AS $$
DECLARE
  archived_count INT;
BEGIN
  WITH moved AS (
    DELETE FROM audit_log
    WHERE created_at < CURRENT_DATE - INTERVAL '3 months'
    RETURNING *
  )
  INSERT INTO audit_log_archive
  SELECT * FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 8. EXTENSIÓN pg_cron (INSTRUCCIONES)
-- ═══════════════════════════════════════
-- Supabase soporta pg_cron en planes Pro+.
-- Si tienes el plan Pro, ejecuta lo siguiente para programar
-- la actualización automática de vistas:
--
-- SELECT cron.schedule(
--   'refresh-materialized-views',
--   '0 */2 * * *',  -- Cada 2 horas
--   'SELECT refresh_materialized_views()'
-- );
--
-- SELECT cron.schedule(
--   'archive-old-logs',
--   '0 3 * * 0',    -- Domingos a las 3AM
--   'SELECT archive_old_access_logs(); SELECT archive_old_audit_logs();'
-- );
--
-- Si NO tienes plan Pro, las vistas se refrescarán
-- desde el frontend con un botón manual o al cargar el dashboard.

-- ═══════════════════════════════════════
-- 9. RLS PARA NUEVAS TABLAS Y VISTAS
-- ═══════════════════════════════════════

-- Las tablas de archivo heredan las mismas políticas
ALTER TABLE access_logs_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY access_archive_select ON access_logs_archive FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = access_logs_archive.gym_id AND user_id = auth.uid())
);

ALTER TABLE audit_log_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_archive_select ON audit_log_archive FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = audit_log_archive.organization_id AND user_id = auth.uid())
);

-- ═══════════════════════════════════════
-- 10. VACUUM ANALYZE (ejecutar una vez después de la migración)
-- ═══════════════════════════════════════
-- Esto actualiza las estadísticas del planificador de queries
-- para que PostgreSQL use los nuevos índices eficientemente.
-- NOTA: Ejecutar esto manualmente después de aplicar la migración.
--
-- ANALYZE members;
-- ANALYZE member_payments;
-- ANALYZE access_logs;
-- ANALYZE classes;
-- ANALYZE class_bookings;
-- ANALYZE subscriptions;
-- ANALYZE audit_log;
-- ANALYZE restaurant_orders;
-- ANALYZE menu_items;
-- ANALYZE reservations;
-- ANALYZE inventory_items;
