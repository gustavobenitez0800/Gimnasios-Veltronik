-- ============================================================================
-- V90 · EL LLAVERO ES DEL SOCIO, APARTE DEL DNI (ADR-016)
-- ============================================================================
--
-- Los socios de Hernández Tecnofit entraban con un llavero de proximidad: lo pasaban por el
-- lector y la PC del mostrador mostraba quién era y cómo estaba su cuota. ControlFit no tenía
-- dónde guardarlo y usaba el campo DNI/ID, así que esos socios llegaron a Veltronik con el
-- número del llavero EN LUGAR del documento.
--
-- Esta tabla es el lugar propio: un renglón por llavero.
--
-- ⭐ Un socio puede tener más de uno, pero un llavero ACTIVO es de un solo socio por sucursal.
-- Lo garantiza el índice único parcial de abajo, no el código: dos mostradores asignando el
-- mismo llavero al mismo tiempo no pueden dejarlo con dos dueños.
--
-- ⭐ Anular, no borrar. Un llavero perdido o pasado a otro socio queda con fecha y motivo, y
-- deja de contar para el índice. Si mañana aparece una entrada rara, se sabe de quién era ese
-- llavero ese día (la misma regla que la caja, V88).
--
-- ⚠️ El código va EN CLARO y sin hash: el número de un llavero no es un secreto —viene impreso
-- en muchos y cualquier celular lo lee— y esconderlo no protegería nada (ADR-016 §1).
--
-- ⚠️ El código se guarda como lo escribe el lector, sin espacios y en mayúsculas, y NADA MÁS:
-- sin sacarle los ceros de adelante. `0012345678` sin los ceros es `12345678`, que es un DNI
-- válido y podría ser el de otro socio (ADR-016 §2). Lo hace cumplir el CHECK de abajo, y la
-- regla de una sola definición vive en `Llavero.normalizar`.
-- ============================================================================

CREATE TABLE member_credential (
    id                      UUID         NOT NULL,
    tenant_id               UUID         NOT NULL,
    member_id               UUID         NOT NULL,
    created_at              TIMESTAMP    NOT NULL,
    updated_at              TIMESTAMP    NOT NULL,
    origin_device_id        UUID,
    performed_by_cashier_id UUID,

    -- Hoy solo LLAVERO. La columna existe para que una tarjeta o un PIN entren mañana sin
    -- tabla nueva; el CHECK obliga a que ese día alguien lo decida en una migración.
    tipo                    VARCHAR(20)  NOT NULL DEFAULT 'LLAVERO',
    codigo                  VARCHAR(64)  NOT NULL,

    -- Quién lo asignó y quién lo dio de baja, con el nombre CONGELADO: si esa persona deja el
    -- gimnasio, el rastro lo sigue diciendo (lo mismo que hecho_por_nombre en la caja).
    asignado_por_nombre     VARCHAR(160),
    dado_de_baja_at         TIMESTAMP,
    motivo_baja             VARCHAR(160),
    dado_de_baja_por_nombre VARCHAR(160),

    CONSTRAINT pk_member_credential PRIMARY KEY (id),
    CONSTRAINT fk_member_credential_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE,
    -- Un socio se borra de verdad solo al purgar la cuenta: ahí sus llaveros se van con él.
    -- Mandarlo a la papelera (V80) NO lo borra, y sus llaveros quedan para cuando vuelva.
    CONSTRAINT fk_member_credential_member_id
        FOREIGN KEY (member_id) REFERENCES gym_member (id) ON DELETE CASCADE,
    CONSTRAINT ck_member_credential_tipo CHECK (tipo IN ('LLAVERO')),
    CONSTRAINT ck_member_credential_codigo
        CHECK (char_length(codigo) BETWEEN 4 AND 64 AND codigo = upper(codigo) AND codigo !~ '\s')
);

-- El llavero activo es de un solo socio. Parcial: los dados de baja no cuentan, así que un
-- llavero perdido que aparece se puede volver a asignar.
CREATE UNIQUE INDEX ux_member_credential_activa
    ON member_credential (tenant_id, tipo, codigo)
    WHERE dado_de_baja_at IS NULL;

-- Los llaveros de un socio (su ficha) y la FK del lado hijo.
CREATE INDEX ix_member_credential_member_id ON member_credential (member_id);

ALTER TABLE member_credential ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE member_credential IS
    'Llaveros de los socios (ADR-016). El código va tal como lo escribe el lector del gimnasio y se compara exacto.';
COMMENT ON COLUMN member_credential.dado_de_baja_at IS
    'NULL = activo. Con fecha: perdido o pasado a otro socio. No se borra: queda el rastro de quién lo tenía.';
