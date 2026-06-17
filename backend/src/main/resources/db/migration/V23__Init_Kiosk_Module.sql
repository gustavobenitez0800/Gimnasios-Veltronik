-- V23__Init_Kiosk_Module.sql
-- Vertical Kiosco / Almacén (retail transaccional). Mismo molde que la V20 (courts).
-- Fase 1: motor de venta + caja + inventario auditado. Fiado/proveedores → fase 2; ARCA → fase 3.

-- Configuración del vertical: UNA fila por tenant (se crea lazy con defaults).
CREATE TABLE kiosk_settings (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE,
    card_surcharge_pct NUMERIC(5,2) NOT NULL DEFAULT 0,   -- recargo por tarjeta (lógica fase 2)
    allow_fiado BOOLEAN NOT NULL DEFAULT false,           -- cuenta corriente (fase 2)
    auto_invoice BOOLEAN NOT NULL DEFAULT false,          -- emitir factura ARCA automática (fase 3)
    low_stock_alert BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Rubros de la góndola (Bebidas, Cigarrillos, Golosinas, Almacén, Servicios...).
CREATE TABLE kiosk_category (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_category_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Productos. stock_quantity es CACHE; la verdad es la suma de kiosk_stock_movement.
-- is_service = recarga virtual / SUBE (no descuenta stock). iva_rate para Factura A/B (fase 3).
CREATE TABLE kiosk_product (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    category_id UUID,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(64),
    cost_price NUMERIC(12,2),
    sale_price NUMERIC(12,2) NOT NULL,
    stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
    is_weighable BOOLEAN NOT NULL DEFAULT false,
    is_service BOOLEAN NOT NULL DEFAULT false,
    iva_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_product_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_product_category FOREIGN KEY (category_id) REFERENCES kiosk_category(id) ON DELETE SET NULL
);

-- ⛔ Un código de barras no puede repetirse dentro del mismo tenant (cuando existe).
-- Índice ÚNICO PARCIAL (mismo patrón que ux_court_booking_slot): permite N productos sin barcode.
CREATE UNIQUE INDEX ux_kiosk_product_barcode
    ON kiosk_product (tenant_id, barcode)
    WHERE barcode IS NOT NULL;

-- Caja / arqueo. SOLO una abierta por tenant (índice único parcial).
CREATE TABLE kiosk_cash_session (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN',           -- OPEN, CLOSED
    opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    opened_at TIMESTAMP NOT NULL,
    opened_by UUID,
    closing_declared NUMERIC(12,2),                       -- lo que el kiosquero contó
    closing_expected NUMERIC(12,2),                       -- fondo + Σ ventas en efectivo
    difference NUMERIC(12,2),                             -- declared - expected
    closed_at TIMESTAMP,
    closed_by UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_cash_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ux_kiosk_cash_session_open
    ON kiosk_cash_session (tenant_id)
    WHERE status = 'OPEN';

-- Ventas (tickets). client_uuid = idempotencia (offline-ready, no duplica al reenviar).
CREATE TABLE kiosk_sale (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cash_session_id UUID NOT NULL,
    client_uuid UUID NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    surcharge NUMERIC(12,2) NOT NULL DEFAULT 0,           -- recargo tarjeta (lógica fase 2)
    total NUMERIC(12,2) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'COMPLETED',      -- COMPLETED, VOIDED
    sold_by UUID,
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_sale_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_sale_session FOREIGN KEY (cash_session_id) REFERENCES kiosk_cash_session(id) ON DELETE CASCADE
);

-- ⛔ Idempotencia: la MISMA venta (mismo client_uuid) no entra dos veces aunque la
-- cola offline la reenvíe. El service traduce el choque a "devolver la venta existente".
CREATE UNIQUE INDEX ux_kiosk_sale_client_uuid
    ON kiosk_sale (tenant_id, client_uuid);

-- Renglones del ticket. Snapshot de nombre/precio/iva: el histórico es inmutable.
CREATE TABLE kiosk_sale_item (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    product_id UUID,                                      -- null si el producto se borró después
    product_name_snapshot VARCHAR(255) NOT NULL,
    unit_price_snapshot NUMERIC(12,2) NOT NULL,
    iva_rate_snapshot NUMERIC(5,2) NOT NULL DEFAULT 21.00,
    quantity NUMERIC(12,3) NOT NULL,
    line_total NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_item_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_item_sale FOREIGN KEY (sale_id) REFERENCES kiosk_sale(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_item_product FOREIGN KEY (product_id) REFERENCES kiosk_product(id) ON DELETE SET NULL,
    CONSTRAINT chk_kiosk_item_qty CHECK (quantity > 0)
);

-- Pago mixto: una venta puede tener varios pagos (efectivo + tarjeta + ...).
CREATE TABLE kiosk_sale_payment (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    method VARCHAR(20) NOT NULL,                          -- CASH, CARD, TRANSFER, MP
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_pay_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_pay_sale FOREIGN KEY (sale_id) REFERENCES kiosk_sale(id) ON DELETE CASCADE,
    CONSTRAINT chk_kiosk_pay_amount CHECK (amount > 0)
);

-- LIBRO MAYOR del inventario. Inmutable: una corrección es OTRO movimiento, no un UPDATE.
CREATE TABLE kiosk_stock_movement (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL,                            -- SALE, PURCHASE, ADJUSTMENT, RETURN, LOSS
    quantity NUMERIC(12,3) NOT NULL,                      -- con signo: venta -, compra +, merma -
    reason VARCHAR(255),
    sale_id UUID,                                         -- si nació de una venta
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by UUID,
    CONSTRAINT fk_kiosk_movement_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_movement_product FOREIGN KEY (product_id) REFERENCES kiosk_product(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_movement_sale FOREIGN KEY (sale_id) REFERENCES kiosk_sale(id) ON DELETE SET NULL
);

-- Índices de producción (todas las consultas calientes scopean por tenant).
CREATE INDEX idx_kiosk_category_tenant ON kiosk_category(tenant_id);
CREATE INDEX idx_kiosk_product_tenant ON kiosk_product(tenant_id);
CREATE INDEX idx_kiosk_product_category ON kiosk_product(category_id);
CREATE INDEX idx_kiosk_cash_tenant_status ON kiosk_cash_session(tenant_id, status);
CREATE INDEX idx_kiosk_sale_session ON kiosk_sale(cash_session_id);
CREATE INDEX idx_kiosk_sale_tenant_created ON kiosk_sale(tenant_id, created_at);
CREATE INDEX idx_kiosk_sale_item_sale ON kiosk_sale_item(sale_id);
CREATE INDEX idx_kiosk_sale_payment_sale ON kiosk_sale_payment(sale_id);
CREATE INDEX idx_kiosk_movement_product ON kiosk_stock_movement(product_id);
CREATE INDEX idx_kiosk_movement_tenant_created ON kiosk_stock_movement(tenant_id, created_at);
