-- V2__init_gym_module.sql

-- Catálogo de planes de membresía que ofrece el gimnasio
CREATE TABLE membership_plan (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration_days INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Socios / Alumnos del gimnasio
CREATE TABLE gym_member (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    dni VARCHAR(50), -- Opcional, pero si se provee suele ser único por tenant
    email VARCHAR(150),
    phone VARCHAR(50),
    birth_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    UNIQUE(tenant_id, dni),
    UNIQUE(tenant_id, email)
);

-- Cuotas / Suscripciones activas de un socio a un plan
CREATE TABLE member_subscription (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    member_id UUID NOT NULL REFERENCES gym_member(id),
    plan_id UUID NOT NULL REFERENCES membership_plan(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID'
);
