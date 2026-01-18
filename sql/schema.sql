-- ============================================
-- GIMNASIO VELTRONIK - SCHEMA COMPLETO
-- SaaS Multi-tenant para Gestión de Gimnasios
-- ============================================

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

-- Tabla de planes de suscripción (SaaS)
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'ARS',
    interval TEXT DEFAULT 'month' CHECK (interval IN ('month', 'quarter', 'year')),
    features JSONB DEFAULT '[]',
    mp_plan_id TEXT, -- ID del plan en Mercado Pago
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de gimnasios (tenants)
CREATE TABLE IF NOT EXISTS gyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'active', 'blocked')),
    plan_id UUID REFERENCES plans(id),
    trial_ends_at TIMESTAMPTZ, -- Fecha fin de periodo demo
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de perfiles (usuarios del sistema)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_id UUID REFERENCES gyms(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'staff'
        CHECK (role IN ('owner', 'admin', 'staff', 'reception')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de suscripciones (Mercado Pago)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE UNIQUE,
    plan_id UUID REFERENCES plans(id),
    mp_subscription_id TEXT, -- ID suscripción en MP
    mp_preapproval_id TEXT, -- ID preapproval en MP
    mp_payer_id TEXT,
    mp_payer_email TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    next_payment_date TIMESTAMPTZ,
    last_payment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de pagos de suscripción (historial)
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    mp_payment_id TEXT,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'ARS',
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
    payment_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de socios del gimnasio
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    dni TEXT,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    birth_date DATE,
    membership_type TEXT DEFAULT 'monthly',
    membership_start DATE,
    membership_end DATE,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'expired', 'suspended')),
    photo_url TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de pagos de socios
CREATE TABLE IF NOT EXISTS member_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    due_date DATE,
    payment_method TEXT DEFAULT 'cash'
        CHECK (payment_method IN ('cash', 'card', 'transfer', 'mercadopago', 'other')),
    status TEXT DEFAULT 'paid'
        CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_gym_id ON profiles(gym_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_dni ON members(dni);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON subscriptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_gym_id ON subscription_payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_member_payments_gym_id ON member_payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_member_payments_member_id ON member_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_member_payments_due_date ON member_payments(due_date);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLÍTICAS RLS
-- ============================================

-- PLANS: Públicos para todos (lectura)
CREATE POLICY "Anyone can view active plans"
    ON plans FOR SELECT
    USING (active = true);

-- GYMS: Usuario solo ve su gimnasio
CREATE POLICY "Users can view their own gym"
    ON gyms FOR SELECT
    USING (id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Owner can update their gym"
    ON gyms FOR UPDATE
    USING (id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- Los usuarios autenticados pueden crear gyms (necesario para onboarding)
-- No verificamos gym_id porque el usuario aún no tiene uno al crear su primer gym
CREATE POLICY "Authenticated users can create gyms"
    ON gyms FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- PROFILES: Usuario ve perfiles de su gimnasio
CREATE POLICY "Users can view profiles from their gym"
    ON profiles FOR SELECT
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid())
        OR id = auth.uid()
    );

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (id = auth.uid());

-- SUBSCRIPTIONS: Solo owner/admin pueden ver
CREATE POLICY "Owner/Admin can view subscriptions"
    ON subscriptions FOR SELECT
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
    );

CREATE POLICY "Owner can insert subscriptions"
    ON subscriptions FOR INSERT
    WITH CHECK (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role = 'owner')
    );

CREATE POLICY "Owner can update subscriptions"
    ON subscriptions FOR UPDATE
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role = 'owner')
    );

-- SUBSCRIPTION_PAYMENTS: Solo owner/admin pueden ver
CREATE POLICY "Owner/Admin can view subscription payments"
    ON subscription_payments FOR SELECT
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
    );

-- MEMBERS: Staff puede ver y gestionar socios de su gimnasio
CREATE POLICY "Staff can view members from their gym"
    ON members FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert members to their gym"
    ON members FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can update members from their gym"
    ON members FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can delete members from their gym"
    ON members FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- MEMBER_PAYMENTS: Staff puede ver y gestionar pagos
CREATE POLICY "Staff can view payments from their gym"
    ON member_payments FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert payments to their gym"
    ON member_payments FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can update payments from their gym"
    ON member_payments FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can delete payments from their gym"
    ON member_payments FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función: Crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Ejecutar al crear usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Función: Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_gyms_updated_at ON gyms;
CREATE TRIGGER update_gyms_updated_at
    BEFORE UPDATE ON gyms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at
    BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DATOS INICIALES (Planes)
-- ============================================

INSERT INTO plans (name, description, price, currency, interval, features, active) VALUES
('Básico', 'Ideal para gimnasios pequeños', 9999.00, 'ARS', 'month', 
 '["Hasta 100 socios", "1 usuario", "Soporte por email"]', true),
('Profesional', 'Para gimnasios en crecimiento', 19999.00, 'ARS', 'month',
 '["Hasta 500 socios", "5 usuarios", "Soporte prioritario", "Reportes avanzados"]', true),
('Enterprise', 'Solución completa para grandes gimnasios', 39999.00, 'ARS', 'month',
 '["Socios ilimitados", "Usuarios ilimitados", "Soporte 24/7", "API access", "Personalización"]', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- FUNCIÓN RPC: Crear Gym para Usuario
-- Esta función usa SECURITY DEFINER para bypasear RLS
-- ============================================

CREATE OR REPLACE FUNCTION create_gym_for_user(
    gym_name TEXT,
    gym_address TEXT DEFAULT NULL,
    gym_phone TEXT DEFAULT NULL,
    gym_email TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    new_gym_id UUID;
    trial_end TIMESTAMPTZ;
    result JSONB;
BEGIN
    -- Verificar que el usuario esté autenticado
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No authenticated user';
    END IF;

    -- Verificar que el usuario no tenga ya un gym
    IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND gym_id IS NOT NULL) THEN
        RAISE EXCEPTION 'User already has a gym';
    END IF;

    -- Calcular fecha fin de trial (30 días)
    trial_end := now() + INTERVAL '30 days';

    -- Crear el gym con estado ACTIVE (demo habilitado)
    INSERT INTO gyms (name, address, phone, email, status, trial_ends_at)
    VALUES (gym_name, gym_address, gym_phone, gym_email, 'active', trial_end)
    RETURNING id INTO new_gym_id;

    -- Actualizar el perfil del usuario con el gym_id y rol owner
    UPDATE profiles
    SET gym_id = new_gym_id, role = 'owner', updated_at = now()
    WHERE id = auth.uid();

    -- Retornar el gym creado
    SELECT jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'address', g.address,
        'phone', g.phone,
        'email', g.email,
        'status', g.status,
        'trial_ends_at', g.trial_ends_at,
        'created_at', g.created_at
    ) INTO result
    FROM gyms g
    WHERE g.id = new_gym_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FIN DEL SCHEMA
-- ============================================
