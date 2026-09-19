-- ============================================================================
-- V85 — La gracia de las suscripciones que ya existen también cubre los
--       reintentos de Mercado Pago
-- ============================================================================
-- POR QUÉ.
-- SubscriptionBillingService.GRACE_DAYS pasó de 3 a 12 el 2026-09-19: Mercado
-- Pago reintenta una cuota rechazada durante 10 días, y con 3 se bloqueaba a un
-- gimnasio mientras MP todavía le estaba cobrando. Ver el comentario de la
-- constante.
--
-- Pero la fecha límite no se calcula al leer: se GUARDA en
-- grace_period_ends_at cuando entra cada cobro. Las suscripciones vigentes
-- tienen guardado el 3 viejo, y el código nuevo recién lo corrige en el próximo
-- cobro aprobado. O sea: justo la renovación que puede rebotar —la próxima—
-- seguiría bloqueando al tercer día. Esta migración las pone al día.
--
-- ── QUÉ TOCA, Y QUÉ NO ─────────────────────────────────────────────────────
-- · Solo suscripciones 'active' o 'past_due'. Una cancelada no tiene gracia
--   que extender.
-- · Solo EXTIENDE. Una gracia que ya fuera más larga no se acorta.
-- · No desbloquea a nadie que no corresponda: si el período terminó hace más
--   de 12 días, la gracia nueva también quedó en el pasado.
--
-- ⚠️ El 12 de acá es el mismo número que GRACE_DAYS. Esto corre una sola vez; lo
-- que manda de acá en adelante es la constante.
-- ============================================================================

UPDATE subscription
   SET grace_period_ends_at = current_period_end + INTERVAL '12 days',
       updated_at = now()
 WHERE current_period_end IS NOT NULL
   AND status IN ('active', 'past_due')
   AND (grace_period_ends_at IS NULL
        OR grace_period_ends_at < current_period_end + INTERVAL '12 days');
