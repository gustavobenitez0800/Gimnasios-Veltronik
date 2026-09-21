-- ============================================================================
-- V86 — El historial de caja de otro sistema, importado
-- ============================================================================
-- POR QUÉ.
-- Un gimnasio que migra trae meses de cobros en el sistema anterior, y el dueño
-- quiere ver sus ingresos desde enero en el tablero, no desde el día que empezó a
-- usar Veltronik. El primero que lo pidió venía de ControlFit, con la caja de enero a
-- septiembre de 2026.
--
-- Esos cobros NO se pueden cargar por el camino normal. Cobrar corre el
-- vencimiento y reactiva al socio (`aplicarCobertura`): cargar historia vieja
-- revivió ex-socios y corrió fechas el 31/08. Y el cierre de caja cuenta desde el
-- último cierre: el primero de un gimnasio mira 30 días para atrás y se habría
-- llevado puesta la plata de ControlFit como si hubiera entrado al cajón hoy.
--
-- ── LA REGLA (ADR-014) ────────────────────────────────────────────────────
-- Un cobro importado es HISTORIA:
--   · SÍ suma en los ingresos (tablero, predicción, resumen del dueño, Pagos).
--   · NO dice nada de la cobertura: no corre vencimientos ni reactiva a nadie.
--   · NO entra a la caja: ni al cierre, ni al balance, ni a la lista de cobros.
--
-- ── QUÉ GUARDA ─────────────────────────────────────────────────────────────
-- gym_payment_import      una fila por importación confirmada, para poder
--                         deshacerla entera.
-- gym_payment.import_id   de qué importación vino el cobro. NULL = se cobró en
--                         Veltronik. Es LA marca que la cobertura y la caja miran.
-- caja_movimiento.import_id   lo mismo para los gastos del historial.
-- *.import_clave          la identidad de la fila en el archivo (fecha, hora,
--                         monto, nombre, y cuántas iguales hubo antes): lo que
--                         hace que subir el mismo archivo dos veces no duplique.
-- ============================================================================

CREATE TABLE gym_payment_import (
    id            UUID          NOT NULL,
    tenant_id     UUID          NOT NULL,
    created_at    TIMESTAMP     NOT NULL,
    updated_at    TIMESTAMP     NOT NULL,
    archivo       VARCHAR(255),
    importado_por UUID,
    origin_device_id        UUID,
    performed_by_cashier_id UUID,
    cobros        INTEGER       NOT NULL DEFAULT 0,
    gastos        INTEGER       NOT NULL DEFAULT 0,
    total_cobros  NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_gastos  NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- El primer y el último movimiento del archivo: "del 01/01 al 17/09".
    desde         TIMESTAMP,
    hasta         TIMESTAMP,
    -- Cualquier cobro de esta importación con updated_at posterior se editó DESPUÉS
    -- de importar, y eso bloquea el deshacer (borrarlo se llevaría la corrección).
    aplicada_at   TIMESTAMP     NOT NULL,
    deshecha_at   TIMESTAMP,
    deshecha_por  UUID,
    CONSTRAINT pk_gym_payment_import PRIMARY KEY (id),
    CONSTRAINT fk_gym_payment_import_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE
);

CREATE INDEX ix_gym_payment_import_tenant_recientes
    ON gym_payment_import (tenant_id, created_at DESC);

-- ── Los cobros ──────────────────────────────────────────────────────────────

ALTER TABLE gym_payment ADD COLUMN import_id    UUID;
ALTER TABLE gym_payment ADD COLUMN import_clave VARCHAR(64);

-- ⚠️ SIN "ON DELETE SET NULL", a propósito. Si la importación desapareciera y el cobro
-- quedara con import_id en NULL, pasaría a parecer un cobro de Veltronik: entraría al
-- cierre de caja de hoy. La purga de una cuenta (V50) borra tabla por tabla y reintenta
-- lo que una FK frena, así que esto no la traba.
ALTER TABLE gym_payment
    ADD CONSTRAINT fk_gym_payment_import_id
        FOREIGN KEY (import_id) REFERENCES gym_payment_import (id);

CREATE INDEX ix_gym_payment_import_id ON gym_payment (import_id);

CREATE UNIQUE INDEX ux_gym_payment_tenant_import_clave
    ON gym_payment (tenant_id, import_clave)
    WHERE import_clave IS NOT NULL;

-- Las dos van juntas: una clave sin importación (o al revés) es una fila a medio escribir.
ALTER TABLE gym_payment
    ADD CONSTRAINT ck_gym_payment_import_completo
        CHECK ((import_id IS NULL) = (import_clave IS NULL));

-- ⭐ LA GARANTÍA DE LA BASE: un cobro importado no cubre ningún período. La cobertura se
-- calcula con period_end (findPaidUntil, los "pagó y figura vencido"): sin período, un
-- cobro importado no puede correr ni reclamar el vencimiento de nadie, aunque mañana
-- alguien escriba una consulta que se olvide de mirar import_id.
ALTER TABLE gym_payment
    ADD CONSTRAINT ck_gym_payment_importado_sin_periodo
        CHECK (import_id IS NULL OR (period_start IS NULL AND period_end IS NULL));

-- ── Los gastos ──────────────────────────────────────────────────────────────

ALTER TABLE caja_movimiento ADD COLUMN import_id    UUID;
ALTER TABLE caja_movimiento ADD COLUMN import_clave VARCHAR(64);

ALTER TABLE caja_movimiento
    ADD CONSTRAINT fk_caja_movimiento_import_id
        FOREIGN KEY (import_id) REFERENCES gym_payment_import (id);

CREATE INDEX ix_caja_movimiento_import_id ON caja_movimiento (import_id);

CREATE UNIQUE INDEX ux_caja_movimiento_tenant_import_clave
    ON caja_movimiento (tenant_id, import_clave)
    WHERE import_clave IS NOT NULL;

ALTER TABLE caja_movimiento
    ADD CONSTRAINT ck_caja_movimiento_import_completo
        CHECK ((import_id IS NULL) = (import_clave IS NULL));

-- Negar por defecto, como todas las tablas de public desde la V68.
ALTER TABLE gym_payment_import ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gym_payment_import IS
    'Una importación de historial de caja de otro sistema. Existe para poder deshacerla (ver V86).';
COMMENT ON COLUMN gym_payment.import_id IS
    'NULL = cobrado en Veltronik. Con valor: historia importada, que suma en ingresos pero no corre vencimientos ni entra a la caja (ADR-014).';
COMMENT ON COLUMN caja_movimiento.import_id IS
    'NULL = anotado en Veltronik. Con valor: un gasto del historial importado, que no entra al arqueo (ADR-014).';
