-- ============================================================
-- V52 — Aranceles del gimnasio y contador de clases del socio
-- ============================================================
-- POR QUÉ.
-- Hasta acá Veltronik decidía la cobertura de un socio por UNA sola cosa: la fecha de
-- vencimiento. El primer cliente migrado (un gimnasio de 385 socios) vende por ARANCEL, y
-- cada arancel otorga dos cosas a la vez: un período Y un cupo de clases. "Pase libre" es
-- un mes con tope de 30 visitas; "3 veces por semana" es un mes con tope de 12.
--
-- Sin el cupo, el sistema no sabe distinguir a alguien que va tres veces por semana de
-- alguien que va todos los días con el mismo abono — que es justamente lo que el gimnasio
-- cobra distinto.
--
-- ── LA REGLA ────────────────────────────────────────────────
-- La cobertura se agota por LO QUE PASE PRIMERO: la fecha o las clases. Un "1 mes / 12
-- clases" cubre un mes, o doce visitas, lo que termine antes.
--
-- ── NO ROMPE A NADIE ────────────────────────────────────────
-- `classes_remaining` es NULL para todos los socios existentes, y NULL significa "este
-- gimnasio no lleva clases": la política se comporta EXACTAMENTE como hoy. Un gimnasio que
-- solo vende mensualidades nunca ve un contador, y no hay que migrarle nada.
-- ============================================================

-- ── Catálogo de aranceles, por gimnasio ─────────────────────
CREATE TABLE IF NOT EXISTS gym_plans (
    id                  UUID PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    name                VARCHAR(120) NOT NULL,
    price               NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Días que otorga. 0 = no mueve la fecha (packs de clases sueltas).
    duration_days       INTEGER NOT NULL DEFAULT 0,

    -- Clases que otorga. NULL = este arancel no trabaja con cupo de clases.
    -- Es la misma distinción que en el socio: NULL no es 0. Cero clases sería un arancel
    -- que no deja entrar nunca; NULL es un arancel que no cuenta visitas.
    classes             INTEGER,

    -- Baja lógica: un arancel que dejó de venderse tiene que seguir existiendo, porque hay
    -- pagos viejos que lo nombran. Borrarlo dejaría huérfana esa historia.
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    origin_device_id    UUID,
    performed_by_cashier_id UUID
);

CREATE INDEX IF NOT EXISTS idx_gym_plans_tenant ON gym_plans(tenant_id);

-- Dos aranceles vigentes con el mismo nombre en el mismo gimnasio serían indistinguibles
-- en el momento de cobrar, que es cuando peor se paga el error. Sin distinguir mayúsculas:
-- "Pase Libre" y "pase libre" son el mismo para quien atiende el mostrador.
CREATE UNIQUE INDEX IF NOT EXISTS ux_gym_plans_tenant_nombre
    ON gym_plans(tenant_id, LOWER(name)) WHERE is_active;

-- ── Contador de clases del socio ────────────────────────────
-- NULL a propósito para todos los existentes: ver la explicación de arriba.
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS classes_remaining INTEGER;

COMMENT ON COLUMN gym_members.classes_remaining IS
    'Visitas que le quedan al socio. NULL = este gimnasio no lleva cupo de clases y la '
    'cobertura la decide solo la fecha. Baja de a una al registrar una ENTRADA.';

-- ── Qué arancel se cobró ────────────────────────────────────
-- Guardar el arancel en el pago (y no solo el monto) es lo que permite después responder
-- "¿cuántos Pase Libre se vendieron en agosto?" sin adivinar por el importe — que cambia
-- cada vez que suben los precios.
ALTER TABLE gym_payments ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES gym_plans(id);
CREATE INDEX IF NOT EXISTS idx_gym_payments_plan ON gym_payments(plan_id);
