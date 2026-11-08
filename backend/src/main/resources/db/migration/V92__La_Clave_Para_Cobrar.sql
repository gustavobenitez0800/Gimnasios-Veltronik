-- ============================================================================
-- V92 · LA CLAVE PARA COBRAR (08/11/2026)
-- ============================================================================
--
-- Lo pidió un gimnasio: «a veces los socios se renuevan solos la cuota». La PC del mostrador
-- queda con la sesión abierta, y cualquiera que se acerque puede registrarse un cobro. El dueño
-- quiere una clave para cobrar, OPCIONAL, que prende él en Ajustes.
--
-- Una fila por sucursal que la prendió; sin fila, no se pide nada (lo de siempre). La clave va
-- con BCrypt, como los PIN de quien atiende (V45): ni Veltronik la puede leer.
--
-- Da RESPONSABILIDAD, no seguridad de bóveda: es la cerradura del mostrador, igual que el PIN del
-- turno. Lo que protege la plata de verdad es el libro de ingresos (V88: el cierre sella, anular
-- y no borrar), el cobro firmado por quien atiende y la hora de cada cobro.
-- ============================================================================

CREATE TABLE clave_de_cobro (
    id                      UUID         NOT NULL,
    tenant_id               UUID         NOT NULL,
    created_at              TIMESTAMP    NOT NULL,
    updated_at              TIMESTAMP    NOT NULL,
    origin_device_id        UUID,
    performed_by_cashier_id UUID,

    clave_hash              VARCHAR(100) NOT NULL,

    CONSTRAINT pk_clave_de_cobro PRIMARY KEY (id),
    -- Una sola clave por sucursal.
    CONSTRAINT uq_clave_de_cobro_tenant_id UNIQUE (tenant_id),
    -- La sucursal se borra (al purgar la cuenta): su clave se va con ella.
    CONSTRAINT fk_clave_de_cobro_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE
);

ALTER TABLE clave_de_cobro ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE clave_de_cobro IS
    'La clave para cobrar de cada sucursal que la activó (opcional). BCrypt. Sin fila, no se pide.';
