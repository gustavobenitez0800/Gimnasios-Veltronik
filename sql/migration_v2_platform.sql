-- ============================================
-- MIGRACIÓN V2: PLATAFORMA MULTI-VERTICAL
-- Transforma el sistema mono-gimnasio en plataforma multi-negocio
-- Idempotente: seguro de ejecutar múltiples veces
-- ============================================

-- =============================================
-- 1. EXTENDER TABLA GYMS → ORGANIZATIONS
-- =============================================
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'GYM' CHECK (type IN ('GYM', 'KIOSK', 'RESTO', 'VET'));
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS cover_url TEXT;

CREATE INDEX IF NOT EXISTS idx_gyms_type ON gyms(type);

-- =============================================
-- 2. TABLA ORGANIZATION_MEMBERS (Muchos a Muchos)
-- =============================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff', 'reception')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. MIGRACIÓN DE DATOS EXISTENTES
-- =============================================
INSERT INTO organization_members (organization_id, user_id, role, status)
SELECT gym_id, id, role, 'active' 
FROM profiles 
WHERE gym_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- =============================================
-- 4. HELPER FUNCTION (SECURITY DEFINER - evita recursión RLS)
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
-- 5. RLS POLICIES: GYMS (ORGANIZATIONS)
-- =============================================

-- SELECT: Ver solo orgs a las que pertenezco
DROP POLICY IF EXISTS "Users can view their own gym" ON gyms;
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON gyms;
CREATE POLICY "Users can view organizations they belong to"
    ON gyms FOR SELECT
    USING (
        id IN (SELECT get_my_org_ids())
    );

-- INSERT: Solo usuarios autenticados pueden crear nuevas orgs
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON gyms;
CREATE POLICY "Authenticated users can create organizations"
    ON gyms FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: Solo owners/admins pueden modificar la org
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

-- DELETE: Solo owners pueden eliminar la org
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
-- 6. RLS POLICIES: ORGANIZATION_MEMBERS
-- =============================================

-- SELECT: Ver miembros de mis orgs (usa helper para evitar recursión)
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;
CREATE POLICY "Users can view members of their organizations"
    ON organization_members FOR SELECT
    USING (
        organization_id IN (SELECT get_my_org_ids())
    );

-- INSERT: Solo owners/admins pueden agregar miembros
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

-- UPDATE: Solo owners/admins pueden cambiar roles
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

-- DELETE: Solo owners pueden remover miembros
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
-- 7. CATÁLOGO DE MÓDULOS
-- =============================================
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

-- =============================================
-- 8. FUNCIÓN RPC: GET MY ORGANIZATIONS
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
    -- A. Organizaciones donde soy Staff/Owner (via organization_members)
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
-- 9. VINCULAR SOCIOS A AUTH (Portal de Socios)
-- =============================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- RLS para socios
DROP POLICY IF EXISTS "Members can view their own data" ON members;
CREATE POLICY "Members can view their own data"
    ON members FOR SELECT
    USING (user_id = auth.uid());

-- =============================================
-- 10. FUNCIÓN RPC: CREAR ORGANIZACIÓN CON OWNER
-- =============================================
-- Crea la org Y automáticamente agrega al usuario como owner en organization_members
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
    -- Calcular fin de trial (30 días)
    trial_end := now() + INTERVAL '30 days';
    
    -- Crear la organización
    INSERT INTO gyms (name, type, address, phone, email, status, trial_ends_at, created_at)
    VALUES (org_name, org_type, org_address, org_phone, org_email, 'active', trial_end, now())
    RETURNING id INTO new_org_id;
    
    -- Agregar al creador como owner
    INSERT INTO organization_members (organization_id, user_id, role, status)
    VALUES (new_org_id, auth.uid(), 'owner', 'active');
    
    -- Actualizar el profile del usuario (backward compat)
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
