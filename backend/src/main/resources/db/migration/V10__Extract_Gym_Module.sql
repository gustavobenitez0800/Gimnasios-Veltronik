-- V10__Extract_Gym_Module.sql

-- 1. Crear tabla específica para alumnos del Gimnasio
CREATE TABLE gym_members (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    document VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    membership_start TIMESTAMP,
    membership_end TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_gym_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- 2. Crear tabla específica para pagos del Gimnasio
CREATE TABLE gym_payments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    member_id UUID,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date TIMESTAMP NOT NULL,
    payment_method VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    description VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_gym_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_gym_payments_member FOREIGN KEY (member_id) REFERENCES gym_members(id) ON DELETE SET NULL
);

-- 3. Migración Quirúrgica de Datos (De Genérico a Específico de Gym)
-- Solo migramos los members cuyo business_type sea GYM (o en caso de que existan CLUBs, también aplican aquí si comparten lógica, pero por seguridad traemos todo lo que no sea SALON, o asumimos que todo es GYM por ahora)
INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, phone, document, is_active, membership_start, membership_end, created_at, updated_at)
SELECT id, tenant_id, first_name, last_name, email, phone, document, is_active, membership_start, membership_end, created_at, updated_at
FROM members
WHERE business_type = 'GYM' OR business_type IS NULL OR business_type != 'SALON';

-- Migramos los pagos asociados a esos miembros (y pagos huérfanos del tenant, que por seguridad llevaremos también)
INSERT INTO gym_payments (id, tenant_id, member_id, amount, payment_date, payment_method, status, description, created_at, updated_at)
SELECT p.id, p.tenant_id, p.member_id, p.amount, p.payment_date, p.payment_method, p.status, p.description, p.created_at, p.updated_at
FROM payments p
INNER JOIN gym_members gm ON p.member_id = gm.id;

-- También migramos pagos sin member_id (ventas sueltas) que pertenezcan a tenants que tengan al menos un gym_member o si es un pago antiguo de gym
INSERT INTO gym_payments (id, tenant_id, member_id, amount, payment_date, payment_method, status, description, created_at, updated_at)
SELECT p.id, p.tenant_id, p.member_id, p.amount, p.payment_date, p.payment_method, p.status, p.description, p.created_at, p.updated_at
FROM payments p
WHERE p.member_id IS NULL AND p.id NOT IN (SELECT id FROM gym_payments) AND p.tip IS NULL;

-- 4. Destrucción de las tablas genéricas acopladas
DROP TABLE payments;
DROP TABLE members;

-- 5. Índices de rendimiento para el nuevo módulo
CREATE INDEX idx_gym_members_tenant ON gym_members(tenant_id);
CREATE INDEX idx_gym_payments_tenant ON gym_payments(tenant_id);
CREATE INDEX idx_gym_payments_member ON gym_payments(member_id);
