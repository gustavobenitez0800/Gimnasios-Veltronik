-- V20__Init_Courts_Module.sql
-- Vertical de canchas (Fútbol 5 hoy; Pádel mañana con el mismo módulo y otra config).

-- Configuración del vertical: UNA fila por tenant (defaults F5: slot 60', seña 15').
CREATE TABLE court_settings (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
    opening_time TIME NOT NULL DEFAULT '09:00',
    closing_time TIME NOT NULL DEFAULT '23:00',
    default_price NUMERIC(12,2),
    deposit_amount NUMERIC(12,2),
    deposit_timeout_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Canchas físicas del complejo.
CREATE TABLE court (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    surface VARCHAR(30),
    covered BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Clientes del complejo. El teléfono normalizado es LA identidad (único por tenant):
-- en Fase 3 el bot de WhatsApp matchea al cliente por número.
CREATE TABLE court_customer (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150),
    notes TEXT,
    no_show_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_customer_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT ux_court_customer_phone UNIQUE (tenant_id, phone)
);

-- Turnos fijos semanales ("los lunes 21hs la tiene Juan"). Plantilla: se materializa
-- como court_booking CONFIRMED para las próximas semanas (job diario + alta inmediata).
CREATE TABLE court_recurring_booking (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    court_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    day_of_week INTEGER NOT NULL,            -- ISO: 1=lunes ... 7=domingo
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    agreed_price NUMERIC(12,2),              -- null = se resuelve por reglas de precio
    valid_from DATE NOT NULL,
    valid_until DATE,                        -- null = sin fecha de fin
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_recurring_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_court_recurring_court FOREIGN KEY (court_id) REFERENCES court(id) ON DELETE CASCADE,
    CONSTRAINT fk_court_recurring_customer FOREIGN KEY (customer_id) REFERENCES court_customer(id) ON DELETE CASCADE,
    CONSTRAINT chk_court_recurring_dow CHECK (day_of_week BETWEEN 1 AND 7)
);

-- Turnos (las celdas de la grilla). Estados:
-- PENDING_DEPOSIT (esperando seña, con expires_at) / CONFIRMED / COMPLETED /
-- CANCELLED / EXPIRED / NO_SHOW / MAINTENANCE (bloqueo del dueño, customer_id null).
CREATE TABLE court_booking (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    court_id UUID NOT NULL,
    customer_id UUID,                        -- null solo para MAINTENANCE
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    total_price NUMERIC(12,2),
    deposit_amount NUMERIC(12,2),
    deposit_paid_at TIMESTAMP,
    mp_payment_id VARCHAR(50),               -- Fase 1.5: idempotencia del webhook de MP
    expires_at TIMESTAMP,                    -- solo PENDING_DEPOSIT: el cron libera al vencer
    recurring_id UUID,                       -- si nació de un turno fijo
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_booking_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_court_booking_court FOREIGN KEY (court_id) REFERENCES court(id) ON DELETE CASCADE,
    CONSTRAINT fk_court_booking_customer FOREIGN KEY (customer_id) REFERENCES court_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_court_booking_recurring FOREIGN KEY (recurring_id) REFERENCES court_recurring_booking(id) ON DELETE SET NULL,
    CONSTRAINT chk_court_booking_range CHECK (end_at > start_at)
);

-- ⛔ ANTI DOBLE-RESERVA (la regla de oro del vertical):
-- dos turnos VIVOS no pueden arrancar en el mismo slot de la misma cancha.
-- Si dos requests compiten (mostrador + bot en Fase 3), la transacción perdedora
-- recibe la violación y el service la traduce a 409. Sin races posibles.
CREATE UNIQUE INDEX ux_court_booking_slot
    ON court_booking (court_id, start_at)
    WHERE status NOT IN ('CANCELLED', 'EXPIRED');

-- Reglas de precio por franja (nocturna ≠ tarde, finde ≠ semana).
-- court_id null = todas las canchas; day_of_week null = todos los días.
CREATE TABLE court_price_rule (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    court_id UUID,
    day_of_week INTEGER,
    time_from TIME NOT NULL,
    time_to TIME NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_price_rule_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_court_price_rule_court FOREIGN KEY (court_id) REFERENCES court(id) ON DELETE CASCADE,
    CONSTRAINT chk_court_price_rule_dow CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_court_price_rule_range CHECK (time_to > time_from)
);

-- Índices de producción (todas las consultas calientes scopean por tenant).
CREATE INDEX idx_court_tenant ON court(tenant_id);
CREATE INDEX idx_court_customer_tenant ON court_customer(tenant_id);
CREATE INDEX idx_court_booking_tenant_start ON court_booking(tenant_id, start_at);
CREATE INDEX idx_court_booking_court_start ON court_booking(court_id, start_at);
CREATE INDEX idx_court_booking_status_expires ON court_booking(status, expires_at);  -- cron de señas
CREATE INDEX idx_court_booking_recurring ON court_booking(recurring_id);
CREATE INDEX idx_court_recurring_tenant ON court_recurring_booking(tenant_id);
CREATE INDEX idx_court_price_rule_tenant ON court_price_rule(tenant_id);
