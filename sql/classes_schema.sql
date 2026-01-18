-- ============================================
-- GIMNASIO VELTRONIK - TABLAS PARA CLASES
-- Sistema de Clases y Reservas
-- ============================================

-- Tabla de clases/actividades del gimnasio
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    instructor TEXT,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Domingo, 6=Sábado
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER DEFAULT 20,
    room TEXT, -- Sala donde se da la clase
    color TEXT DEFAULT '#0EA5E9', -- Color para calendario
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled')),
    recurring BOOLEAN DEFAULT true, -- Si se repite semanalmente
    specific_date DATE, -- Para clases de fecha específica
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de reservas de clases
CREATE TABLE IF NOT EXISTS class_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL, -- Fecha específica de la reserva
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'attended', 'no_show')),
    booked_at TIMESTAMPTZ DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    attended_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(class_id, member_id, booking_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_classes_gym_id ON classes(gym_id);
CREATE INDEX IF NOT EXISTS idx_classes_day_of_week ON classes(day_of_week);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);
CREATE INDEX IF NOT EXISTS idx_class_bookings_class_id ON class_bookings(class_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_member_id ON class_bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_gym_id ON class_bookings(gym_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_booking_date ON class_bookings(booking_date);

-- Habilitar RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_bookings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para classes
CREATE POLICY "Staff can view classes from their gym"
    ON classes FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert classes to their gym"
    ON classes FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can update classes from their gym"
    ON classes FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can delete classes from their gym"
    ON classes FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- Políticas RLS para class_bookings
CREATE POLICY "Staff can view bookings from their gym"
    ON class_bookings FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert bookings to their gym"
    ON class_bookings FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can update bookings from their gym"
    ON class_bookings FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can delete bookings from their gym"
    ON class_bookings FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- Trigger para updated_at en classes
DROP TRIGGER IF EXISTS update_classes_updated_at ON classes;
CREATE TRIGGER update_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
