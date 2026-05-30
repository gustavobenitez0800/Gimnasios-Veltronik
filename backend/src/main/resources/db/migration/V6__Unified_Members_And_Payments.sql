-- V6__Unified_Members_And_Payments.sql

-- 1. Tabla Unificada de Miembros (Reemplaza a gym_members y salon_clients)
CREATE TABLE members (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    document VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    business_type VARCHAR(20),
    membership_start TIMESTAMP,
    membership_end TIMESTAMP,
    last_visit TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- 2. Tabla Unificada de Pagos (Reemplaza a gym_member_payments y salon_sales)
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    member_id UUID,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date TIMESTAMP NOT NULL,
    payment_method VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    description VARCHAR(255),
    tip DECIMAL(10, 2),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

-- 3. Tabla de Suscripciones (Sincronización con Mercado Pago para los dueños)
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    mp_subscription_id VARCHAR(100),
    plan_name VARCHAR(100),
    amount DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'ARS',
    status VARCHAR(50) NOT NULL,
    next_payment_date TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- MIGRACIÓN DE DATOS (Legacy a Unificado)
-- 1. Mover Gym Members
INSERT INTO members (id, tenant_id, first_name, last_name, email, phone, document, is_active, business_type, membership_start, membership_end, created_at, updated_at)
SELECT id, tenant_id, first_name, last_name, email, phone, dni, status = 'ACTIVE', 'GYM', membership_start, membership_end, created_at, updated_at
FROM gym_member
ON CONFLICT (id) DO NOTHING;

-- 2. Mover Pagos Legacy
INSERT INTO payments (id, tenant_id, member_id, amount, payment_date, payment_method, status, description, created_at, updated_at)
SELECT id, tenant_id, member_id, amount, payment_date, payment_method, status, notes, created_at, updated_at
FROM member_payment
ON CONFLICT (id) DO NOTHING;
