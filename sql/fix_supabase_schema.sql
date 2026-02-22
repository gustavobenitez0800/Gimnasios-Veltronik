-- ============================================
-- CORRECCIÓN DE SCHEMA SUPABASE
-- Ejecutar COMPLETO en SQL Editor de Supabase
-- Seguro de re-ejecutar (idempotente)
-- ============================================

-- =============================================
-- 1. CONSTRAINT FALTANTE: UNIQUE en organization_members
-- Sin esto, un usuario podría tener duplicados en la misma org
-- =============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organization_members_organization_id_user_id_key'
    ) THEN
        ALTER TABLE organization_members 
        ADD CONSTRAINT organization_members_organization_id_user_id_key 
        UNIQUE (organization_id, user_id);
    END IF;
END $$;

-- =============================================
-- 2. INDEXES FALTANTES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_gyms_type ON gyms(type);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- =============================================
-- 3. HABILITAR RLS EN TODAS LAS TABLAS
-- =============================================
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_biometrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 4. MIGRAR DATOS EXISTENTES → organization_members
-- (Si profiles tiene gym_id pero organization_members no tiene el registro)
-- =============================================
INSERT INTO organization_members (organization_id, user_id, role, status)
SELECT gym_id, id, role, 'active' 
FROM profiles 
WHERE gym_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- =============================================
-- 5. FUNCIÓN HELPER: get_my_org_ids (evita recursión RLS)
-- =============================================
CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS TABLE (organization_id UUID) 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid();
END;
$$;

-- =============================================
-- 6. RLS POLICIES: GYMS
-- =============================================

-- SELECT
DROP POLICY IF EXISTS "Users can view their own gym" ON gyms;
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON gyms;
CREATE POLICY "Users can view organizations they belong to"
    ON gyms FOR SELECT
    USING (id IN (SELECT get_my_org_ids()));

-- INSERT
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON gyms;
CREATE POLICY "Authenticated users can create organizations"
    ON gyms FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE
DROP POLICY IF EXISTS "Owners can update their organizations" ON gyms;
CREATE POLICY "Owners can update their organizations"
    ON gyms FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = gyms.id 
            AND om.user_id = auth.uid()
            AND om.role IN ('owner', 'admin')
        )
    );

-- DELETE
DROP POLICY IF EXISTS "Owners can delete their organizations" ON gyms;
CREATE POLICY "Owners can delete their organizations"
    ON gyms FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = gyms.id 
            AND om.user_id = auth.uid()
            AND om.role = 'owner'
        )
    );

-- =============================================
-- 7. RLS POLICIES: ORGANIZATION_MEMBERS
-- =============================================

-- SELECT
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;
CREATE POLICY "Users can view members of their organizations"
    ON organization_members FOR SELECT
    USING (organization_id IN (SELECT get_my_org_ids()));

-- INSERT
DROP POLICY IF EXISTS "Owners can add members to their organizations" ON organization_members;
CREATE POLICY "Owners can add members to their organizations"
    ON organization_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om_check
            WHERE om_check.organization_id = organization_members.organization_id
            AND om_check.user_id = auth.uid()
            AND om_check.role IN ('owner', 'admin')
        )
    );

-- UPDATE
DROP POLICY IF EXISTS "Owners can update member roles" ON organization_members;
CREATE POLICY "Owners can update member roles"
    ON organization_members FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om_check
            WHERE om_check.organization_id = organization_members.organization_id
            AND om_check.user_id = auth.uid()
            AND om_check.role IN ('owner', 'admin')
        )
    );

-- DELETE
DROP POLICY IF EXISTS "Owners can remove members" ON organization_members;
CREATE POLICY "Owners can remove members"
    ON organization_members FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om_check
            WHERE om_check.organization_id = organization_members.organization_id
            AND om_check.user_id = auth.uid()
            AND om_check.role = 'owner'
        )
    );

-- =============================================
-- 8. RLS POLICIES: MEMBERS (socios del gym)
-- =============================================
DROP POLICY IF EXISTS "Members can view their own data" ON members;
CREATE POLICY "Members can view their own data"
    ON members FOR SELECT
    USING (
        user_id = auth.uid() 
        OR gym_id IN (SELECT get_my_org_ids())
    );

DROP POLICY IF EXISTS "Staff can manage members" ON members;
CREATE POLICY "Staff can manage members"
    ON members FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 9. RLS POLICIES: MEMBER_PAYMENTS
-- =============================================
DROP POLICY IF EXISTS "Staff can manage payments" ON member_payments;
CREATE POLICY "Staff can manage payments"
    ON member_payments FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 10. RLS POLICIES: CLASSES
-- =============================================
DROP POLICY IF EXISTS "Staff can manage classes" ON classes;
CREATE POLICY "Staff can manage classes"
    ON classes FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 11. RLS POLICIES: CLASS_BOOKINGS
-- =============================================
DROP POLICY IF EXISTS "Staff can manage bookings" ON class_bookings;
CREATE POLICY "Staff can manage bookings"
    ON class_bookings FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 12. RLS POLICIES: ACCESS_LOGS
-- =============================================
DROP POLICY IF EXISTS "Staff can manage access logs" ON access_logs;
CREATE POLICY "Staff can manage access logs"
    ON access_logs FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 13. RLS POLICIES: ACCESS_DEVICES
-- =============================================
DROP POLICY IF EXISTS "Staff can manage devices" ON access_devices;
CREATE POLICY "Staff can manage devices"
    ON access_devices FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 14. RLS POLICIES: MEMBER_BIOMETRICS
-- =============================================
DROP POLICY IF EXISTS "Staff can manage biometrics" ON member_biometrics;
CREATE POLICY "Staff can manage biometrics"
    ON member_biometrics FOR ALL
    USING (gym_id IN (SELECT get_my_org_ids()));

-- =============================================
-- 15. RLS POLICIES: PROFILES
-- =============================================
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

-- =============================================
-- 16. FUNCIÓN RPC: get_my_organizations
-- =============================================
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
    -- A. Organizaciones donde soy Staff/Owner
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
    
    -- B. Organizaciones donde soy Socio (via members.user_id)
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

-- =============================================
-- 17. FUNCIÓN RPC: create_organization_with_owner
-- =============================================
CREATE OR REPLACE FUNCTION create_organization_with_owner(
    org_name TEXT,
    org_type TEXT DEFAULT 'GYM',
    org_address TEXT DEFAULT NULL,
    org_phone TEXT DEFAULT NULL,
    org_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org_id UUID;
    trial_end TIMESTAMPTZ;
BEGIN
    trial_end := now() + INTERVAL '30 days';
    
    INSERT INTO gyms (name, type, address, phone, email, status, trial_ends_at, created_at)
    VALUES (org_name, org_type, org_address, org_phone, org_email, 'active', trial_end, now())
    RETURNING id INTO new_org_id;
    
    INSERT INTO organization_members (organization_id, user_id, role, status)
    VALUES (new_org_id, auth.uid(), 'owner', 'active');
    
    UPDATE profiles SET gym_id = new_org_id, role = 'owner' WHERE id = auth.uid() AND gym_id IS NULL;
    
    RETURN jsonb_build_object(
        'id', new_org_id,
        'name', org_name,
        'type', org_type,
        'status', 'active',
        'trial_ends_at', trial_end
    );
END;
$$;

-- =============================================
-- 18. MÓDULOS (si no existen)
-- =============================================
INSERT INTO app_modules (id, name, description, icon_name, available) VALUES
('gym-v1', 'Gimnasio Veltronik', 'Gestión completa para centros deportivos, socios y rutinas.', 'gym_icon', true),
('kiosk-v1', 'Kiosco Punto de Venta', 'Ventas rápidas, control de stock y caja diaria.', 'store_icon', false),
('resto-v1', 'Restaurante / Bar', 'Comandas, mesas y gestión de cocina.', 'restaurant_icon', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ✅ LISTO. Todo aplicado.
-- ============================================
