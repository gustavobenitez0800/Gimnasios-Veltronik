-- ============================================
-- VELTRONIK - FIX 014: ROLE SECURITY HARDENING
-- ============================================
-- Fixes critical security issues found in EMERGENCY_FIX.sql
-- where RPC functions lost their permission checks.
-- Also fixes organization_members RLS to allow
-- teammates to see each other (required for TeamPage).
-- ============================================

-- ═══════════════════════════════════════
-- PASO 1: FIX organization_members SELECT policy
-- ═══════════════════════════════════════
-- EMERGENCY_FIX changed this to only: user_id = auth.uid()
-- This broke TeamPage: users can't see their teammates.
-- We need: "see your own memberships + see members of orgs you belong to"

DROP POLICY IF EXISTS org_members_select ON public.organization_members;
CREATE POLICY org_members_select ON public.organization_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR organization_id IN (
            SELECT om2.organization_id FROM public.organization_members om2
            WHERE om2.user_id = auth.uid()
        )
    );

-- ═══════════════════════════════════════
-- PASO 2: FIX organization_members UPDATE policy
-- ═══════════════════════════════════════
-- EMERGENCY_FIX set: user_id = auth.uid()
-- This means any user can change their OWN role!
-- Must be: only owner/admin of that org can update members.

DROP POLICY IF EXISTS org_members_update ON public.organization_members;
CREATE POLICY org_members_update ON public.organization_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om2
            WHERE om2.organization_id = organization_members.organization_id
            AND om2.user_id = auth.uid()
            AND om2.role IN ('owner', 'admin')
        )
    );

-- ═══════════════════════════════════════
-- PASO 3: FIX organization_members DELETE policy
-- ═══════════════════════════════════════
-- EMERGENCY_FIX set: user_id = auth.uid()
-- This means any user can remove THEMSELVES from any org!
-- Must be: only owner of that org can delete members.

DROP POLICY IF EXISTS org_members_delete ON public.organization_members;
CREATE POLICY org_members_delete ON public.organization_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om2
            WHERE om2.organization_id = organization_members.organization_id
            AND om2.user_id = auth.uid()
            AND om2.role = 'owner'
        )
    );

-- ═══════════════════════════════════════
-- PASO 4: RESTORE secure RPC functions
-- ═══════════════════════════════════════
-- EMERGENCY_FIX removed ALL permission checks from RPCs.
-- This means any authenticated user could:
--   - Invite anyone to any org
--   - Change roles in any org
--   - Remove anyone from any org

-- 4a) invite_team_member — require caller to be owner or admin
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
    -- Verify caller has permission
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'No tenés permisos para invitar miembros.';
    END IF;

    -- Prevent assigning owner role
    IF invite_role = 'owner' THEN
        RAISE EXCEPTION 'No se puede asignar el rol de dueño.';
    END IF;

    -- Admin can't invite other admins (only owner can)
    IF invite_role = 'admin' AND caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede asignar el rol de administrador.';
    END IF;

    -- Find user by email
    SELECT id INTO target_user_id FROM auth.users WHERE email = invite_email;
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado. Debe registrarse primero en Veltronik.';
    END IF;

    -- Can't invite yourself
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés invitarte a vos mismo.';
    END IF;

    -- Insert or update membership
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (target_user_id, org_id, invite_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = invite_role;

    -- Set gym_id on profile if they don't have one
    UPDATE public.profiles SET gym_id = org_id WHERE id = target_user_id AND gym_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4b) update_team_member_role — require caller to be owner
CREATE OR REPLACE FUNCTION update_team_member_role(
    org_id UUID,
    target_user_id UUID,
    new_role TEXT
)
RETURNS VOID AS $$
DECLARE
    caller_role TEXT;
BEGIN
    -- Verify caller is owner
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede cambiar roles.';
    END IF;

    -- Prevent assigning owner role
    IF new_role = 'owner' THEN
        RAISE EXCEPTION 'No se puede asignar el rol de dueño.';
    END IF;

    -- Can't change own role
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés cambiar tu propio rol.';
    END IF;

    -- Validate role value
    IF new_role NOT IN ('admin', 'staff', 'reception') THEN
        RAISE EXCEPTION 'Rol inválido: %', new_role;
    END IF;

    -- Update (never touch owner rows)
    UPDATE public.organization_members
    SET role = new_role
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4c) remove_team_member — require caller to be owner
CREATE OR REPLACE FUNCTION remove_team_member(
    org_id UUID,
    target_user_id UUID
)
RETURNS VOID AS $$
DECLARE
    caller_role TEXT;
BEGIN
    -- Verify caller is owner
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede eliminar miembros del equipo.';
    END IF;

    -- Can't remove yourself
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés eliminarte a vos mismo del equipo.';
    END IF;

    -- Delete (never touch owner rows)
    DELETE FROM public.organization_members
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4d) get_team_members — add permission check
-- Must DROP first because PostgreSQL can't change RETURNS TABLE with CREATE OR REPLACE
DROP FUNCTION IF EXISTS get_team_members(UUID);
CREATE FUNCTION get_team_members(org_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Verify caller belongs to this organization
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'No tenés acceso a este equipo.';
    END IF;

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

-- 4e) get_activity_log — add permission check
DROP FUNCTION IF EXISTS get_activity_log(UUID, INT);
CREATE FUNCTION get_activity_log(org_id UUID, log_limit INT DEFAULT 50)
RETURNS TABLE (
    action TEXT,
    entity_type TEXT,
    user_name TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Verify caller belongs to this organization
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'No tenés acceso al historial de esta organización.';
    END IF;

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
