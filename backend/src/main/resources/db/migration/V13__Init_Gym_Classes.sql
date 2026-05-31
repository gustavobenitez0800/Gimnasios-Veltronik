-- V13__Init_Gym_Classes.sql

-- Módulo de Clases del Gimnasio
CREATE TABLE gym_class (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    instructor VARCHAR(255),
    day_of_week VARCHAR(20) NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 20,
    room VARCHAR(100),
    color VARCHAR(20),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_gym_class_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Módulo de Reservas (Bookings) para las Clases
CREATE TABLE class_booking (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    class_id UUID NOT NULL,
    member_id UUID NOT NULL,
    booking_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_class_booking_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_class_booking_class FOREIGN KEY (class_id) REFERENCES gym_class(id) ON DELETE CASCADE,
    CONSTRAINT fk_class_booking_member FOREIGN KEY (member_id) REFERENCES gym_members(id) ON DELETE CASCADE,
    UNIQUE (class_id, member_id, booking_date) -- Un socio no puede reservar la misma clase dos veces en el mismo día
);

CREATE INDEX idx_gym_class_tenant ON gym_class(tenant_id);
CREATE INDEX idx_class_booking_tenant ON class_booking(tenant_id);
CREATE INDEX idx_class_booking_class ON class_booking(class_id);
CREATE INDEX idx_class_booking_member ON class_booking(member_id);
CREATE INDEX idx_class_booking_date ON class_booking(booking_date);
