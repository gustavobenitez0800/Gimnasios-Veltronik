-- ============================================
-- VELTRONIK - SCHEMA COMPLETO: GIMNASIO
-- Base de datos en Supabase (PostgreSQL)
-- ============================================
-- Versión: 2.0 (2026-04-17)
-- Este archivo documenta la estructura COMPLETA
-- y definitiva de tablas para el sistema de gimnasios.
-- Ejecutar en Supabase SQL Editor en orden.
--
-- MIGRACIONES APLICADAS:
--   001: Columnas faltantes (plan_id, mp_preapproval_id, etc.)
--   002: Tabla subscription_payments
--   003: Tabla audit_log + función real
--   004: Triggers updated_at automáticos
--   005: RLS policies granulares con WITH CHECK
--   006: Seed data, seguridad RPC, storage bucket
-- ============================================

-- ═══════════════════════════════════════
-- 0. EXTENSIONES
-- ═══════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════
-- 1. PERFILES DE USUARIO
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    gym_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-crear perfil al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ═══════════════════════════════════════
-- 2. PLANES DE SUSCRIPCIÓN (antes de gyms por FK)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- 3. ORGANIZACIONES (GIMNASIOS / NEGOCIOS)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS gyms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    organization_type TEXT DEFAULT 'GYM',  -- GYM, RESTO, KIOSK, OTHER
    status TEXT DEFAULT 'active',           -- active, pending, blocked
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    trial_ends_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- 4. MIEMBROS DE ORGANIZACIÓN (EQUIPO)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'owner',  -- owner, admin, staff, reception
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON organization_members(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- ═══════════════════════════════════════
-- 5. SOCIOS DEL GIMNASIO
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    dni TEXT,
    phone TEXT,
    email TEXT,
    birth_date DATE,
    photo_url TEXT,
    membership_start DATE,
    membership_end DATE,
    status TEXT DEFAULT 'active',            -- active, inactive, expired, suspended
    attendance_days JSONB DEFAULT '[]',      -- [1,2,3,4,5] = Lun-Vie
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_dni ON members(dni);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_dni_gym ON members(gym_id, dni)
    WHERE dni IS NOT NULL AND dni != '';

-- ═══════════════════════════════════════
-- 6. PAGOS DE SOCIOS
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS member_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'cash',      -- cash, card, transfer, mercadopago, other
    status TEXT DEFAULT 'paid',              -- paid, pending
    period_start DATE,
    period_end DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_gym_id ON member_payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON member_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON member_payments(payment_date);

-- ═══════════════════════════════════════
-- 7. CLASES Y ACTIVIDADES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instructor TEXT,
    day_of_week INT,                         -- 0=Dom, 1=Lun, ..., 6=Sáb
    start_time TIME,
    end_time TIME,
    capacity INT DEFAULT 20,
    room TEXT,
    color TEXT DEFAULT '#0EA5E9',
    description TEXT,
    status TEXT DEFAULT 'active',            -- active, inactive
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_gym_id ON classes(gym_id);

-- ═══════════════════════════════════════
-- 8. RESERVAS DE CLASES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS class_bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    status TEXT DEFAULT 'booked',            -- booked, attended, cancelled
    booked_at TIMESTAMPTZ DEFAULT NOW(),
    attended_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bookings_class_date ON class_bookings(class_id, booking_date);

-- ═══════════════════════════════════════
-- 9. CONTROL DE ACCESO
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS access_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_at TIMESTAMPTZ,
    access_method TEXT DEFAULT 'manual',     -- manual, qr, device, fingerprint
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_gym_date ON access_logs(gym_id, check_in_at);
CREATE INDEX IF NOT EXISTS idx_access_member ON access_logs(member_id);

-- ═══════════════════════════════════════
-- 10. SUSCRIPCIONES DE PLATAFORMA
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id),
    status TEXT DEFAULT 'pending',           -- active, pending, past_due, canceled
    mp_subscription_id TEXT,                 -- ID legacy de MercadoPago
    mp_preapproval_id TEXT,                  -- ID de PreApproval de MercadoPago
    mp_payer_id TEXT,
    mp_payer_email TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    next_payment_date TIMESTAMPTZ,
    last_payment_date TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON subscriptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_mp_preapproval
    ON subscriptions(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

-- ═══════════════════════════════════════
-- 11. PAGOS DE SUSCRIPCIÓN (para idempotencia del webhook)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    mp_payment_id TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'ARS',
    status TEXT DEFAULT 'pending',           -- approved, pending, rejected, refunded
    payment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_payments_mp_id ON subscription_payments(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_gym ON subscription_payments(gym_id);

-- ═══════════════════════════════════════
-- 12. AUDITORÍA
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_date ON audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

-- ═══════════════════════════════════════
-- 13. FUNCIONES RPC
-- ═══════════════════════════════════════

-- Función de auto-update para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear organización con owner
CREATE OR REPLACE FUNCTION create_organization_with_owner(
    org_name TEXT,
    org_type TEXT DEFAULT 'GYM',
    org_address TEXT DEFAULT NULL,
    org_phone TEXT DEFAULT NULL,
    org_email TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_gym_id UUID;
    current_user_id UUID;
    result JSON;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO gyms (name, organization_type, address, phone, email, status, trial_ends_at)
    VALUES (org_name, org_type, org_address, org_phone, org_email, 'active', NOW() + INTERVAL '30 days')
    RETURNING id INTO new_gym_id;

    INSERT INTO organization_members (user_id, organization_id, role)
    VALUES (current_user_id, new_gym_id, 'owner');

    UPDATE profiles SET gym_id = new_gym_id WHERE id = current_user_id;

    result := json_build_object(
        'id', new_gym_id,
        'name', org_name,
        'type', org_type
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear gimnasio (legacy — mantener compatibilidad)
CREATE OR REPLACE FUNCTION create_gym_for_user(
    gym_name TEXT,
    gym_address TEXT DEFAULT NULL,
    gym_phone TEXT DEFAULT NULL,
    gym_email TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
    RETURN create_organization_with_owner(gym_name, 'GYM', gym_address, gym_phone, gym_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Obtener miembros del equipo
CREATE OR REPLACE FUNCTION get_team_members(org_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT om.user_id, p.full_name, p.email, om.role, om.created_at
    FROM organization_members om
    JOIN profiles p ON p.id = om.user_id
    WHERE om.organization_id = org_id
    ORDER BY
        CASE om.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'staff' THEN 2
            WHEN 'reception' THEN 3
            ELSE 4
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Invitar miembro (con verificación de permisos)
CREATE OR REPLACE FUNCTION invite_team_member(
    org_id UUID,
    invite_email TEXT,
    invite_role TEXT DEFAULT 'staff'
)
RETURNS VOID AS $$
DECLARE
    target_user_id UUID;
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role
    FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'No tenés permisos para invitar miembros.';
    END IF;

    IF invite_role = 'owner' THEN
        RAISE EXCEPTION 'No se puede asignar el rol de dueño.';
    END IF;

    SELECT id INTO target_user_id FROM auth.users WHERE email = invite_email;
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado. Debe registrarse primero en Veltronik.';
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés invitarte a vos mismo.';
    END IF;

    INSERT INTO organization_members (user_id, organization_id, role)
    VALUES (target_user_id, org_id, invite_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = invite_role;

    UPDATE profiles SET gym_id = org_id WHERE id = target_user_id AND gym_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cambiar rol (con verificación)
CREATE OR REPLACE FUNCTION update_team_member_role(
    org_id UUID,
    target_user_id UUID,
    new_role TEXT
)
RETURNS VOID AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role
    FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede cambiar roles.';
    END IF;

    IF new_role = 'owner' THEN
        RAISE EXCEPTION 'No se puede asignar el rol de dueño.';
    END IF;

    UPDATE organization_members
    SET role = new_role
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar miembro (con verificación)
CREATE OR REPLACE FUNCTION remove_team_member(
    org_id UUID,
    target_user_id UUID
)
RETURNS VOID AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role
    FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede eliminar miembros del equipo.';
    END IF;

    DELETE FROM organization_members
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Activity log (implementación real)
CREATE OR REPLACE FUNCTION get_activity_log(org_id UUID, log_limit INT DEFAULT 50)
RETURNS TABLE (
    action TEXT,
    entity_type TEXT,
    user_name TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.action,
        al.entity_type,
        COALESCE(p.full_name, 'Sistema') AS user_name,
        al.created_at
    FROM audit_log al
    LEFT JOIN profiles p ON p.id = al.user_id
    WHERE al.organization_id = org_id
    ORDER BY al.created_at DESC
    LIMIT log_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper para registrar auditoría
CREATE OR REPLACE FUNCTION log_audit_event(
    org_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details)
    VALUES (org_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- 14. ROW LEVEL SECURITY
-- ═══════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_select ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- Plans (público lectura)
CREATE POLICY plans_select ON plans FOR SELECT USING (true);

-- Gyms
CREATE POLICY gyms_select ON gyms FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = gyms.id AND user_id = auth.uid())
);
CREATE POLICY gyms_insert ON gyms FOR INSERT WITH CHECK (true);
CREATE POLICY gyms_update ON gyms FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = gyms.id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Organization Members
CREATE POLICY org_members_select ON organization_members FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM organization_members om2 WHERE om2.organization_id = organization_members.organization_id AND om2.user_id = auth.uid())
);
CREATE POLICY org_members_insert ON organization_members FOR INSERT WITH CHECK (true);
CREATE POLICY org_members_update ON organization_members FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members om2 WHERE om2.organization_id = organization_members.organization_id AND om2.user_id = auth.uid() AND om2.role IN ('owner', 'admin'))
);
CREATE POLICY org_members_delete ON organization_members FOR DELETE USING (
    EXISTS (SELECT 1 FROM organization_members om2 WHERE om2.organization_id = organization_members.organization_id AND om2.user_id = auth.uid() AND om2.role = 'owner')
);

-- Members
CREATE POLICY members_select ON members FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
);
CREATE POLICY members_insert ON members FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
);
CREATE POLICY members_update ON members FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
);
CREATE POLICY members_delete ON members FOR DELETE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Payments
CREATE POLICY payments_select ON member_payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
);
CREATE POLICY payments_insert ON member_payments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
);
CREATE POLICY payments_update ON member_payments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
);
CREATE POLICY payments_delete ON member_payments FOR DELETE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Classes
CREATE POLICY classes_select ON classes FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
);
CREATE POLICY classes_insert ON classes FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
);
CREATE POLICY classes_update ON classes FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
);
CREATE POLICY classes_delete ON classes FOR DELETE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Bookings
CREATE POLICY bookings_select ON class_bookings FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
);
CREATE POLICY bookings_insert ON class_bookings FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
);
CREATE POLICY bookings_update ON class_bookings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
);
CREATE POLICY bookings_delete ON class_bookings FOR DELETE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Access Logs
CREATE POLICY access_select ON access_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
);
CREATE POLICY access_insert ON access_logs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
);
CREATE POLICY access_update ON access_logs FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
);

-- Subscriptions
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = subscriptions.gym_id AND user_id = auth.uid())
);
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE USING (true);

-- Subscription Payments
CREATE POLICY subscription_payments_select ON subscription_payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = subscription_payments.gym_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Audit Log
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = audit_log.organization_id AND user_id = auth.uid())
);
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = audit_log.organization_id AND user_id = auth.uid())
);

-- ═══════════════════════════════════════
-- 15. TRIGGERS updated_at
-- ═══════════════════════════════════════

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name = 'updated_at'
        AND table_name NOT IN ('schema_migrations')
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trigger_updated_at ON public.%I; ' ||
            'CREATE TRIGGER trigger_updated_at BEFORE UPDATE ON public.%I ' ||
            'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            tbl, tbl
        );
    END LOOP;
END $$;

-- ═══════════════════════════════════════
-- 16. SEED DATA
-- ═══════════════════════════════════════

INSERT INTO plans (name, price, features, is_active)
SELECT 'Inicial', 0, '["Hasta 50 socios", "Panel básico", "Control de acceso"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Inicial');

INSERT INTO plans (name, price, features, is_active)
SELECT 'Profesional', 35000, '["Socios ilimitados", "Panel completo", "Clases y reservas", "Reportes", "Equipo (hasta 5)", "Retención de socios", "Soporte prioritario"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Profesional');

INSERT INTO plans (name, price, features, is_active)
SELECT 'Empresarial', 65000, '["Todo de Profesional", "Multi-sucursal", "Equipo ilimitado", "API personalizada", "Soporte 24/7", "Auditoría completa"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Empresarial');
