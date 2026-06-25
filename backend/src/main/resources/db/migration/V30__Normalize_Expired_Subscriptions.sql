-- ============================================================
-- V30__Normalize_Expired_Subscriptions.sql
-- ============================================================
-- VERDAD DE DATOS (no cambia el acceso).
--
-- Una suscripción con status='active' cuyo current_period_end YA venció seguía diciendo
-- 'active' para siempre. Es el residuo del cutover V1->V2: el ETL copió las suscripciones
-- de V1 verbatim (status + período), y los clientes que nunca se re-suscribieron en V2
-- (ej: SEKUR) quedaron con un 'active' mentiroso aunque su período expiró.
--
-- El KillSwitch / SubscriptionAccessPolicy YA bloquea un período vencido (un 'active' con
-- current_period_end < ahora NO otorga acceso), así que esto NO altera quién entra; solo
-- corrige el ESTADO para que deje de mentir y el dato sea diagnosticable.
--
-- Idempotente y forward-only (sin DDL). El cron (TenantSubscriptionJob) repite esta
-- normalización cada noche para los que venzan de ahora en más.
--
-- Nota de zona: las fechas se guardan como hora-pared de Argentina (la JVM corre en AR).
-- Por eso comparamos contra (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'), que
-- devuelve el "ahora" AR como timestamp sin zona, igual que LocalDateTime.now() en el código.

UPDATE subscriptions
   SET status     = 'expired',
       updated_at = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
 WHERE status = 'active'
   AND current_period_end IS NOT NULL
   AND current_period_end < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires');
