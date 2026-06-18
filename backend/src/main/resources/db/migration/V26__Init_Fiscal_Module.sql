-- V26__Init_Fiscal_Module.sql
-- Módulo FISCAL: facturación electrónica ARCA (ex-AFIP). COMPARTIDO por todas las verticales
-- (hoy lo usa kiosk; mañana gym/courts). Por eso el comprobante referencia su origen de forma
-- genérica (source_type + source_id), SIN FK a las tablas de ningún vertical → desacoplado.

-- Configuración fiscal del tenant: su CUIT, condición y credenciales ARCA (CIFRADAS en reposo).
CREATE TABLE fiscal_config (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE,
    cuit BIGINT NOT NULL,
    razon_social VARCHAR(255),
    condicion_iva VARCHAR(30) NOT NULL,                  -- MONOTRIBUTO, RESPONSABLE_INSCRIPTO, EXENTO
    environment VARCHAR(15) NOT NULL DEFAULT 'HOMOLOGACION', -- HOMOLOGACION, PRODUCCION
    default_pos_number INTEGER,                          -- punto de venta por defecto
    -- Certificado X.509 (PEM) y clave privada (PEM), CIFRADOS con AES-GCM. Nunca en texto plano,
    -- nunca se exponen por la API. La master key vive fuera de la DB (env var).
    certificate_enc TEXT,
    private_key_enc TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,              -- emite comprobantes solo si está completo y activo
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_fiscal_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Puntos de venta registrados en ARCA para este tenant.
CREATE TABLE fiscal_point_of_sale (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    number INTEGER NOT NULL,                              -- nro de punto de venta (1..N) en ARCA
    description VARCHAR(120),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_fiscal_pos_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT ux_fiscal_pos_number UNIQUE (tenant_id, number)
);

-- Comprobantes (facturas/notas). El origen es genérico (no FK a verticales).
CREATE TABLE fiscal_voucher (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    source_type VARCHAR(40),                             -- ej. 'KIOSK_SALE' (desacopla fiscal de la vertical)
    source_id UUID,                                      -- id de la venta/origen, SIN FK
    voucher_type VARCHAR(20) NOT NULL,                   -- FACTURA_A / FACTURA_B / FACTURA_C / NOTA_CREDITO_*
    point_of_sale INTEGER NOT NULL,
    number BIGINT,                                       -- nro de comprobante (lo asigna ARCA); null hasta autorizar
    voucher_date DATE NOT NULL,
    doc_tipo INTEGER NOT NULL DEFAULT 99,                -- 80=CUIT, 96=DNI, 99=consumidor final
    doc_nro BIGINT,                                      -- documento del receptor (null para consumidor final < umbral)
    condicion_iva_receptor_id INTEGER NOT NULL DEFAULT 5, -- 5=Consumidor Final (req. por RG 5616)
    concepto INTEGER NOT NULL DEFAULT 1,                 -- 1=productos
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    iva_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    cae VARCHAR(20),                                     -- Código de Autorización Electrónico (14 díg)
    cae_expiration DATE,
    qr_url TEXT,                                         -- QR obligatorio verificable de ARCA
    status VARCHAR(15) NOT NULL DEFAULT 'PENDING',       -- PENDING, AUTHORIZED, REJECTED, CONTINGENCY
    arca_observations TEXT,                              -- motivo de rechazo / observaciones de ARCA
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_fiscal_voucher_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- ⛔ Numeración única de comprobantes AUTORIZADOS por (tenant, punto de venta, tipo, número).
-- Parcial: los PENDING/CONTINGENCY todavía no tienen número definitivo.
CREATE UNIQUE INDEX ux_fiscal_voucher_number
    ON fiscal_voucher (tenant_id, point_of_sale, voucher_type, number)
    WHERE status = 'AUTHORIZED';

-- Detalle del comprobante (para el PDF/ticket; WSFEv1 sin detalle no lo exige, pero lo guardamos).
CREATE TABLE fiscal_voucher_item (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    voucher_id UUID NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    iva_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00,
    subtotal NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_fiscal_item_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_fiscal_item_voucher FOREIGN KEY (voucher_id) REFERENCES fiscal_voucher(id) ON DELETE CASCADE
);

-- Índices de producción (scope por tenant).
CREATE INDEX idx_fiscal_pos_tenant ON fiscal_point_of_sale(tenant_id);
CREATE INDEX idx_fiscal_voucher_tenant_created ON fiscal_voucher(tenant_id, created_at);
CREATE INDEX idx_fiscal_voucher_status ON fiscal_voucher(status);          -- cron de contingencia
CREATE INDEX idx_fiscal_voucher_source ON fiscal_voucher(source_type, source_id);
CREATE INDEX idx_fiscal_voucher_item_voucher ON fiscal_voucher_item(voucher_id);
