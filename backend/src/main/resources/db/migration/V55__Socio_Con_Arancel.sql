-- ============================================================================
-- V55 — El socio tiene un arancel
-- ============================================================================
-- Hasta acá el arancel era del PAGO: quien atendía lo elegía en cada cobro, de
-- memoria. Eso es al revés de como funciona un gimnasio — el socio "es de Pase
-- Libre", y eso no cambia mes a mes.
--
-- Con el arancel en la ficha, cobrar deja de ser una decisión: se aplica el que
-- el socio ya tiene. Y el sistema puede responder "¿cuántos socios de Pase Libre
-- tengo?", que hoy no puede porque el dato solo existía pegado a pagos sueltos.
--
-- NULL = sin arancel asignado, y se comporta como siempre: se cobra un importe a
-- mano. No se fuerza a nadie a usar la función.
--
-- ON DELETE SET NULL: dar de baja un arancel no puede romper la ficha de 200
-- socios. Quedan sin arancel y se les asigna otro cuando corresponda.
-- ============================================================================

ALTER TABLE gym_members
    ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES gym_plans(id) ON DELETE SET NULL;

-- El listado de socios filtra y agrupa por arancel; sin índice eso es un recorrido
-- completo de la tabla en cada carga de la pantalla.
CREATE INDEX IF NOT EXISTS ix_gym_members_plan ON gym_members(tenant_id, plan_id)
    WHERE plan_id IS NOT NULL;

COMMENT ON COLUMN gym_members.plan_id IS
    'Arancel que paga este socio. NULL = sin arancel asignado, se le cobra a mano.';
