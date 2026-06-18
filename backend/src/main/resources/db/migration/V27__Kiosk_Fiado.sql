-- V27__Kiosk_Fiado.sql
-- Fase 2 del kiosco: CUENTA CORRIENTE (fiado). El "anotámelo" del barrio.
-- Cliente con saldo + libro mayor de la deuda (append-only, igual que el inventario).

CREATE TABLE kiosk_customer (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    dni_cuit VARCHAR(20),
    credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 0 = sin límite
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,        -- cuánto DEBE (cache; verdad = Σ movimientos)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_customer_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Libro mayor de la cuenta corriente. DEBT = compró fiado (sube la deuda); PAYMENT = pagó (la baja).
CREATE TABLE kiosk_account_movement (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    type VARCHAR(10) NOT NULL,                        -- DEBT / PAYMENT
    amount NUMERIC(12,2) NOT NULL,                    -- siempre positivo; el tipo da la dirección
    sale_id UUID,                                     -- si nació de una venta fiada
    notes VARCHAR(255),
    created_by UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_acct_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_acct_customer FOREIGN KEY (customer_id) REFERENCES kiosk_customer(id) ON DELETE CASCADE,
    CONSTRAINT chk_kiosk_acct_amount CHECK (amount > 0)
);

-- La venta puede ir a cuenta corriente de un cliente.
ALTER TABLE kiosk_sale ADD COLUMN customer_id UUID;
ALTER TABLE kiosk_sale ADD CONSTRAINT fk_kiosk_sale_customer
    FOREIGN KEY (customer_id) REFERENCES kiosk_customer(id) ON DELETE SET NULL;

CREATE INDEX idx_kiosk_customer_tenant ON kiosk_customer(tenant_id);
CREATE INDEX idx_kiosk_acct_customer ON kiosk_account_movement(customer_id);
CREATE INDEX idx_kiosk_acct_tenant_created ON kiosk_account_movement(tenant_id, created_at);
CREATE INDEX idx_kiosk_sale_customer ON kiosk_sale(customer_id);
