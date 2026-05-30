-- V4__gym_operations_b2c.sql
-- Migración para el módulo de Operaciones B2C del Gimnasio:
-- 1. Columnas faltantes en gym_member
-- 2. Tabla de Pagos de Socios (member_payment)
-- 3. Tabla de Clases (gym_class)
-- 4. Tabla de Reservas de Clases (class_booking)

-- ═══════════════════════════════════════
-- 1. COLUMNAS NUEVAS EN GYM_MEMBER
-- ═══════════════════════════════════════
ALTER TABLE gym_member ADD COLUMN IF NOT EXISTS membership_start DATE;
ALTER TABLE gym_member ADD COLUMN IF NOT EXISTS membership_end DATE;
ALTER TABLE gym_member ADD COLUMN IF NOT EXISTS attendance_days TEXT DEFAULT '[]';
ALTER TABLE gym_member ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_gym_member_status ON gym_member(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_gym_member_membership_end ON gym_member(tenant_id, membership_end);

-- ═══════════════════════════════════════
-- 2. PAGOS DE SOCIOS (B2C)
-- ═══════════════════════════════════════
CREATE TABLE member_payment (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    member_id UUID NOT NULL REFERENCES gym_member(id),
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    period_start DATE,
    period_end DATE,
    notes TEXT
);

CREATE INDEX idx_member_payment_tenant ON member_payment(tenant_id);
CREATE INDEX idx_member_payment_member ON member_payment(member_id);
CREATE INDEX idx_member_payment_date ON member_payment(tenant_id, payment_date);

-- ═══════════════════════════════════════
-- 3. CLASES Y ACTIVIDADES
-- ═══════════════════════════════════════
CREATE TABLE gym_class (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    name VARCHAR(100) NOT NULL,
    instructor VARCHAR(100),
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    capacity INTEGER DEFAULT 20,
    room VARCHAR(100),
    color VARCHAR(20) DEFAULT '#0EA5E9',
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX idx_gym_class_tenant ON gym_class(tenant_id);

-- ═══════════════════════════════════════
-- 4. RESERVAS DE CLASES
-- ═══════════════════════════════════════
CREATE TABLE class_booking (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    class_id UUID NOT NULL REFERENCES gym_class(id),
    member_id UUID NOT NULL REFERENCES gym_member(id),
    booking_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'BOOKED'
);

CREATE INDEX idx_class_booking_class_date ON class_booking(class_id, booking_date);
CREATE INDEX idx_class_booking_member ON class_booking(member_id);
