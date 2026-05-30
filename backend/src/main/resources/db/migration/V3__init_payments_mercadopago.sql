-- V3__init_payments_mercadopago.sql

CREATE TABLE tenant_payment (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    mp_payment_id VARCHAR(100) UNIQUE,
    mp_preapproval_id VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    payment_date TIMESTAMP NOT NULL
);

-- Index para busquedas rápidas de webhooks
CREATE INDEX idx_tenant_payment_mp_payment_id ON tenant_payment(mp_payment_id);
