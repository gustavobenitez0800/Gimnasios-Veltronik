-- ============================================
-- 🚨 VELTRONIK - EMERGENCY FIX 🚨
-- ============================================
-- EJECUTAR INMEDIATAMENTE EN SUPABASE SQL EDITOR
-- Restaura acceso para todos los clientes.
-- ============================================

-- ═══════════════════════════════════════
-- PASO 1: ARREGLAR organization_members (CAUSA RAÍZ)
-- La policy org_members_select tiene referencia circular
-- que bloquea TODAS las demás policies.
-- ═══════════════════════════════════════

DROP POLICY IF EXISTS org_members_select ON public.organization_members;
DROP POLICY IF EXISTS org_members_insert ON public.organization_members;
DROP POLICY IF EXISTS org_members_update ON public.organization_members;
DROP POLICY IF EXISTS org_members_delete ON public.organization_members;

-- Policy simple y segura: cada usuario ve sus propias membresías
CREATE POLICY org_members_select ON public.organization_members
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY org_members_insert ON public.organization_members
    FOR INSERT WITH CHECK (true);

CREATE POLICY org_members_update ON public.organization_members
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY org_members_delete ON public.organization_members
    FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════════════
-- PASO 2: RESTAURAR policies de tablas core
-- Usar FOR ALL que es lo que funcionaba antes
-- ═══════════════════════════════════════

-- MEMBERS
DROP POLICY IF EXISTS members_all ON public.members;
DROP POLICY IF EXISTS members_select ON public.members;
DROP POLICY IF EXISTS members_insert ON public.members;
DROP POLICY IF EXISTS members_update ON public.members;
DROP POLICY IF EXISTS members_delete ON public.members;
CREATE POLICY members_all ON public.members FOR ALL USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
);

-- PAYMENTS
DROP POLICY IF EXISTS payments_all ON public.member_payments;
DROP POLICY IF EXISTS payments_select ON public.member_payments;
DROP POLICY IF EXISTS payments_insert ON public.member_payments;
DROP POLICY IF EXISTS payments_update ON public.member_payments;
DROP POLICY IF EXISTS payments_delete ON public.member_payments;
CREATE POLICY payments_all ON public.member_payments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
);

-- CLASSES
DROP POLICY IF EXISTS classes_all ON public.classes;
DROP POLICY IF EXISTS classes_select ON public.classes;
DROP POLICY IF EXISTS classes_insert ON public.classes;
DROP POLICY IF EXISTS classes_update ON public.classes;
DROP POLICY IF EXISTS classes_delete ON public.classes;
CREATE POLICY classes_all ON public.classes FOR ALL USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
);

-- BOOKINGS
DROP POLICY IF EXISTS bookings_all ON public.class_bookings;
DROP POLICY IF EXISTS bookings_select ON public.class_bookings;
DROP POLICY IF EXISTS bookings_insert ON public.class_bookings;
DROP POLICY IF EXISTS bookings_update ON public.class_bookings;
DROP POLICY IF EXISTS bookings_delete ON public.class_bookings;
CREATE POLICY bookings_all ON public.class_bookings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
);

-- ACCESS LOGS
DROP POLICY IF EXISTS access_all ON public.access_logs;
DROP POLICY IF EXISTS access_select ON public.access_logs;
DROP POLICY IF EXISTS access_insert ON public.access_logs;
DROP POLICY IF EXISTS access_update ON public.access_logs;
CREATE POLICY access_all ON public.access_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
);

-- PROFILES
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- GYMS
DROP POLICY IF EXISTS gyms_select ON public.gyms;
DROP POLICY IF EXISTS gyms_insert ON public.gyms;
DROP POLICY IF EXISTS gyms_update ON public.gyms;
CREATE POLICY gyms_select ON public.gyms FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = gyms.id AND user_id = auth.uid())
);
CREATE POLICY gyms_insert ON public.gyms FOR INSERT WITH CHECK (true);
CREATE POLICY gyms_update ON public.gyms FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = gyms.id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS subscriptions_select ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_insert ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_update ON public.subscriptions;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = subscriptions.gym_id AND user_id = auth.uid())
);
CREATE POLICY subscriptions_insert ON public.subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY subscriptions_update ON public.subscriptions FOR UPDATE USING (true);

-- PLANS (público)
DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT USING (true);

-- ═══════════════════════════════════════
-- PASO 3: Restaurar funciones RPC que se borraron
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION invite_team_member(
    org_id UUID,
    invite_email TEXT,
    invite_role TEXT DEFAULT 'staff'
)
RETURNS VOID AS $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = invite_email;
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado. Debe registrarse primero.';
    END IF;
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (target_user_id, org_id, invite_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = invite_role;
    UPDATE public.profiles SET gym_id = org_id WHERE id = target_user_id AND gym_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_team_member_role(
    org_id UUID,
    target_user_id UUID,
    new_role TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.organization_members
    SET role = new_role
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION remove_team_member(
    org_id UUID,
    target_user_id UUID
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.organization_members
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
