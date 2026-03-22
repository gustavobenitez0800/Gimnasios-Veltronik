-- ============================================
-- SQL SCRIPT PARA RESTAURAR OBJETOS FALTANTES 
-- EN LA BASE DE DATOS SUPABASE (PRODUCCIÓN)
-- Extraídos del esquema de producción original
-- ============================================

-- ============================================
-- 1. TABLA: CLASSES
-- ============================================
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    instructor TEXT,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER DEFAULT 20,
    room TEXT,
    color TEXT DEFAULT '#0EA5E9',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled')), i
    recurring BOOLEAN DEFAULT true,
    specific_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. TABLA: CLASS_BOOKINGS
-- ============================================
CREATE TABLE IF NOT EXISTS class_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'attended', 'no_show')),
    booked_at TIMESTAMPTZ DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    attended_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(class_id, member_id, booking_date)
);

CREATE INDEX IF NOT EXISTS idx_classes_gym_id ON classes(gym_id);
CREATE INDEX IF NOT EXISTS idx_classes_day_of_week ON classes(day_of_week);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);
CREATE INDEX IF NOT EXISTS idx_class_bookings_class_id ON class_bookings(class_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_member_id ON class_bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_gym_id ON class_bookings(gym_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_booking_date ON class_bookings(booking_date);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_bookings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. TABLA: ACCESS_DEVICES
-- ============================================
CREATE TABLE IF NOT EXISTS access_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    device_type TEXT NOT NULL DEFAULT 'relay'
        CHECK (device_type IN (
            'turnstile', 'electric_door', 'external_controller', 'standalone_reader', 'relay'
        )),
    connection_type TEXT NOT NULL DEFAULT 'simulation'
        CHECK (connection_type IN (
            'tcp_ip', 'sdk', 'api_rest', 'serial', 'usb_hid', 'simulation'
        )),
    supported_credentials JSONB DEFAULT '["rfid","qr"]'::jsonb,
    connection_config JSONB DEFAULT '{}'::jsonb,
    open_duration INTEGER DEFAULT 3000,
    auto_close BOOLEAN DEFAULT true,
    feedback_enabled BOOLEAN DEFAULT true,
    inverted_logic BOOLEAN DEFAULT false,
    open_command JSONB,
    close_command JSONB,
    antipassback_enabled BOOLEAN DEFAULT false,
    antipassback_minutes INTEGER DEFAULT 30,
    max_capacity INTEGER,
    schedule JSONB,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    is_online BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_access_devices_gym_id ON access_devices(gym_id);
CREATE INDEX IF NOT EXISTS idx_access_devices_status ON access_devices(status);
CREATE INDEX IF NOT EXISTS idx_access_devices_type ON access_devices(device_type);

ALTER TABLE access_devices ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. TABLA: MEMBER_BIOMETRICS
-- ============================================
CREATE TABLE IF NOT EXISTS member_biometrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    biometric_type TEXT NOT NULL CHECK (biometric_type IN ('fingerprint', 'facial', 'rfid_card', 'qr_code')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    template_hash TEXT,
    card_code TEXT,
    qr_code TEXT,
    device_id TEXT,
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    enrolled_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(member_id, biometric_type, template_hash)
);

CREATE INDEX IF NOT EXISTS idx_member_biometrics_gym_id ON member_biometrics(gym_id);
CREATE INDEX IF NOT EXISTS idx_member_biometrics_member_id ON member_biometrics(member_id);
CREATE INDEX IF NOT EXISTS idx_member_biometrics_type ON member_biometrics(biometric_type);
CREATE INDEX IF NOT EXISTS idx_member_biometrics_card_code ON member_biometrics(card_code) WHERE card_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_biometrics_qr_code ON member_biometrics(qr_code) WHERE qr_code IS NOT NULL;

ALTER TABLE member_biometrics ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. TABLA: APP_MODULES
-- ============================================
CREATE TABLE IF NOT EXISTS app_modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon_name TEXT,
    marketing_features JSONB,
    available BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_modules (id, name, description, icon_name, available) VALUES
('gym-v1', 'Gimnasio Veltronik', 'Gestión completa para centros deportivos, socios y rutinas.', 'gym_icon', true),
('kiosk-v1', 'Kiosco Punto de Venta', 'Ventas rápidas, control de stock y caja diaria.', 'store_icon', false),
('resto-v1', 'Restaurante / Bar', 'Comandas, mesas y gestión de cocina.', 'restaurant_icon', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. COLUMNAS FALTANTES EN SUBSCRIPTIONS
-- ============================================
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- ============================================
-- 7. FUNCIÓN RPC: GET MY ORGANIZATIONS
-- ============================================
CREATE OR REPLACE FUNCTION get_my_organizations()
RETURNS TABLE (
    org_id UUID,
    org_name TEXT,
    org_type TEXT,
    my_role TEXT,
    status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        g.id,
        g.name,
        g.type,
        om.role,
        g.status
    FROM gyms g
    JOIN organization_members om ON g.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND om.status = 'active'
    
    UNION ALL
    
    SELECT 
        g.id,
        g.name,
        g.type,
        'member'::text as role,
        g.status
    FROM gyms g
    JOIN members m ON g.id = m.gym_id
    WHERE m.user_id = auth.uid() 
      AND m.status = 'active';
END;
$$;

-- ============================================
-- 8. POLÍTICAS DE RLS SEGURAS
-- ============================================

-- Helper si no existe
CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS TABLE (organization_id UUID) 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid();
END;
$$;

-- Classes
DROP POLICY IF EXISTS "Staff can manage classes" ON classes;
CREATE POLICY "Staff can manage classes" ON classes FOR ALL USING (gym_id IN (SELECT get_my_org_ids()));

-- Class Bookings
DROP POLICY IF EXISTS "Staff can manage bookings" ON class_bookings;
CREATE POLICY "Staff can manage bookings" ON class_bookings FOR ALL USING (gym_id IN (SELECT get_my_org_ids()));

-- Access Devices
DROP POLICY IF EXISTS "Staff can manage devices" ON access_devices;
CREATE POLICY "Staff can manage devices" ON access_devices FOR ALL USING (gym_id IN (SELECT get_my_org_ids()));

-- Member Biometrics
DROP POLICY IF EXISTS "Staff can manage biometrics" ON member_biometrics;
CREATE POLICY "Staff can manage biometrics" ON member_biometrics FOR ALL USING (gym_id IN (SELECT get_my_org_ids()));
