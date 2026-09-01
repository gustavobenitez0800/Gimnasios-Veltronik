-- ============================================================================
-- V57 — Rastro de los cobros que se tocan después
-- ============================================================================
-- El arqueo de caja no sirve de nada si un cobro se puede modificar o borrar
-- después sin que quede nada. El robo perfecto era este:
--
--   1. El socio paga $48.000 en efectivo → se registra. El socio se va contento
--      y su vencimiento se corrió.
--   2. Más tarde se BORRA el cobro y la plata queda en el bolsillo.
--   3. Y lo peor: borrar un cobro NO recalcula la cobertura, así que el socio
--      sigue figurando al día y nunca reclama. Nadie se entera nunca.
--
-- Editar el monto de 48.000 a 40.000 es el mismo robo, más prolijo.
--
-- Esta tabla no impide nada: DEJA RASTRO. Cada cambio de monto, de método, de
-- estado o de socio, y cada borrado, queda anotado con el antes, el después y
-- quién lo hizo. Después el cierre de caja del período lo muestra: "en este
-- período se ajustaron 2 cobros".
--
-- Solo se anotan los campos que mueven plata. Corregir una nota o una fecha de
-- pago no es sospechoso y anotarlo sería ruido que hace ignorar la lista entera.
--
-- ⚠️ NO tiene FK al cobro a propósito: el rastro de un borrado tiene que
-- SOBREVIVIR al cobro borrado. Con una FK en cascada, borrar el cobro se llevaría
-- puesta justamente la prueba de que se borró.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gym_payment_ajuste (
    id                        UUID PRIMARY KEY,
    tenant_id                 UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    -- A qué cobro le pasó. Sin FK: el cobro puede no existir más.
    payment_id                UUID NOT NULL,

    -- 'EDICION' o 'BORRADO'.
    tipo                      VARCHAR(20) NOT NULL,

    -- Qué cambió y de qué a qué. En un borrado, `antes` lleva el resumen del
    -- cobro que se fue y `despues` queda vacío.
    campo                     VARCHAR(40),
    antes                     VARCHAR(255),
    despues                   VARCHAR(255),

    -- El nombre congelado de quien lo hizo: si ese empleado se da de baja, el
    -- rastro tiene que seguir diciendo quién fue.
    hecho_por_nombre          VARCHAR(160),

    created_at                TIMESTAMP,
    updated_at                TIMESTAMP,
    origin_device_id          UUID,
    performed_by_cashier_id   UUID
);

-- La consulta es siempre "qué se tocó en este período", para el cierre de caja.
CREATE INDEX IF NOT EXISTS ix_pago_ajuste_tenant_fecha
    ON gym_payment_ajuste (tenant_id, created_at DESC);

COMMENT ON TABLE gym_payment_ajuste IS
    'Rastro de cobros editados o borrados. No impide el cambio: lo hace visible.';
