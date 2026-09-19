-- ============================================================================
-- V84 — Importar socios, y poder deshacerlo
-- ============================================================================
-- POR QUÉ.
-- Hasta acá Veltronik no tenía importador. La migración del primer cliente
-- (31/08, 385 socios desde AccesoGym) se hizo con nueve scripts sueltos
-- corridos a mano contra producción: altas de a una por HTTP, sin transacción
-- y sin forma de volver atrás. Llevó cinco horas y tres scripts de reparación
-- (diagnostico_fechas, arreglar_aranceles, asignar_aranceles_a_socios), y se
-- siguió arreglando al otro día.
--
-- El importador nuevo escribe todo en UNA transacción —o entran todos o no
-- entra ninguno—, pero eso cubre el error que se ve en el momento. Estas dos
-- tablas cubren el que se descubre después: "subí el archivo equivocado", "el
-- Excel tenía las fechas corridas". Sin ellas, deshacer una importación de
-- 400 socios es borrarlos de a uno.
--
-- ── QUÉ GUARDA ─────────────────────────────────────────────────────────────
-- gym_member_import       una fila por importación confirmada: quién, cuándo,
--                         qué archivo y cuántos creó/actualizó.
-- gym_member_import_item  una fila por socio que la importación TOCÓ. Si lo
--                         creó, alcanza con saber cuál es. Si lo actualizó,
--                         `antes` guarda los valores que tenía en los campos
--                         que cambiaron — solo esos —, para devolvérselos.
--
-- Los socios que la importación dejó igual no dejan rastro: no hay nada que
-- deshacerles.
--
-- ── EL CUIDADO DEL DESHACER VIVE EN EL CÓDIGO, NO ACÁ ──────────────────────
-- Deshacer solo se permite si NINGÚN socio tocado cambió después (un cobro, una
-- edición, una entrada por la puerta). Esa regla es de negocio y la aplica
-- ImportacionSociosService; esta migración solo guarda lo necesario para poder
-- aplicarla.
-- ============================================================================

CREATE TABLE gym_member_import (
    id            UUID         NOT NULL,
    tenant_id     UUID         NOT NULL,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    archivo       VARCHAR(255),
    importado_por UUID,
    origin_device_id        UUID,
    performed_by_cashier_id UUID,
    creados       INTEGER      NOT NULL DEFAULT 0,
    actualizados  INTEGER      NOT NULL DEFAULT 0,
    sin_cambios   INTEGER      NOT NULL DEFAULT 0,
    -- El instante en que terminó de escribir. Cualquier socio con updated_at
    -- posterior se tocó DESPUÉS de importar, y eso bloquea el deshacer.
    aplicada_at   TIMESTAMP    NOT NULL,
    deshecha_at   TIMESTAMP,
    deshecha_por  UUID,
    CONSTRAINT pk_gym_member_import PRIMARY KEY (id),
    CONSTRAINT fk_gym_member_import_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE
);

-- "La última importación de este gimnasio" es la única consulta que se hace.
CREATE INDEX ix_gym_member_import_tenant_recientes
    ON gym_member_import (tenant_id, created_at DESC);

CREATE TABLE gym_member_import_item (
    id          UUID         NOT NULL,
    tenant_id   UUID         NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP    NOT NULL,
    import_id   UUID         NOT NULL,
    member_id   UUID         NOT NULL,
    accion      VARCHAR(12)  NOT NULL,
    antes       JSONB,
    origin_device_id        UUID,
    performed_by_cashier_id UUID,
    CONSTRAINT pk_gym_member_import_item PRIMARY KEY (id),
    CONSTRAINT fk_gym_member_import_item_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_gym_member_import_item_import_id
        FOREIGN KEY (import_id) REFERENCES gym_member_import (id) ON DELETE CASCADE,
    -- Con cascada: si el socio se borra de verdad (la purga de una cuenta, V50), su
    -- rastro de importación no tiene a quién apuntar y no puede frenar el borrado.
    CONSTRAINT fk_gym_member_import_item_member_id
        FOREIGN KEY (member_id) REFERENCES gym_member (id) ON DELETE CASCADE,
    CONSTRAINT ck_gym_member_import_item_accion
        CHECK (accion IN ('CREADO', 'ACTUALIZADO'))
);

CREATE INDEX ix_gym_member_import_item_import ON gym_member_import_item (import_id);
CREATE INDEX ix_gym_member_import_item_member ON gym_member_import_item (member_id);
CREATE INDEX ix_gym_member_import_item_tenant ON gym_member_import_item (tenant_id);

-- Negar por defecto, como todas las tablas de public desde la V68: el backend entra como
-- dueño y no pasa por RLS; la clave anon del bundle no tiene nada que leer acá.
ALTER TABLE gym_member_import      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_member_import_item ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gym_member_import IS
    'Una importación de socios confirmada. Existe para poder deshacerla (ver V84).';
COMMENT ON COLUMN gym_member_import_item.antes IS
    'Solo en ACTUALIZADO: los valores que tenía el socio en los campos que la importación cambió.';
