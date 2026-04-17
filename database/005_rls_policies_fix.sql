-- ============================================
-- VELTRONIK - FIX 005: RLS POLICIES MEJORADAS
-- ============================================
-- Arregla policies que usan FOR ALL sin WITH CHECK.
-- FOR ALL = SELECT + INSERT + UPDATE + DELETE
-- Sin WITH CHECK, los INSERT fallan silenciosamente.
-- ============================================

-- ═══════════════════════════════════════
-- PROFILES: Agregar INSERT policy para el trigger
-- ═══════════════════════════════════════
-- El trigger handle_new_user() usa SECURITY DEFINER, así que funciona.
-- Pero por seguridad explícita:
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════
-- GYMS: Agregar INSERT policy
-- ═══════════════════════════════════════
-- create_organization_with_owner() usa SECURITY DEFINER, OK.
-- Pero necesitamos policy explícita por si se inserta directo:
DROP POLICY IF EXISTS gyms_insert ON public.gyms;
CREATE POLICY gyms_insert ON public.gyms
    FOR INSERT WITH CHECK (true);
-- (El insert real se hace via RPC con SECURITY DEFINER)

-- ═══════════════════════════════════════
-- ORGANIZATION_MEMBERS: Policies granulares
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS org_members_select ON public.organization_members;
CREATE POLICY org_members_select ON public.organization_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om2
            WHERE om2.organization_id = organization_members.organization_id
            AND om2.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS org_members_insert ON public.organization_members;
CREATE POLICY org_members_insert ON public.organization_members
    FOR INSERT WITH CHECK (true);
-- (Inserts via RPC SECURITY DEFINER: create_organization_with_owner, invite_team_member)

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
-- PLANS: Políticas (tabla pública de lectura)
-- ═══════════════════════════════════════
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans
    FOR SELECT USING (true);
-- Plans son públicos para lectura (cualquier usuario autenticado puede ver los planes)

-- ═══════════════════════════════════════
-- MEMBERS: Separar policies para mejor control
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS members_all ON public.members;

DROP POLICY IF EXISTS members_select ON public.members;
CREATE POLICY members_select ON public.members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS members_insert ON public.members;
CREATE POLICY members_insert ON public.members
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS members_update ON public.members;
CREATE POLICY members_update ON public.members
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = members.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS members_delete ON public.members;
CREATE POLICY members_delete ON public.members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = members.gym_id AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- ═══════════════════════════════════════
-- PAYMENTS: Separar policies
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS payments_all ON public.member_payments;

DROP POLICY IF EXISTS payments_select ON public.member_payments;
CREATE POLICY payments_select ON public.member_payments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS payments_insert ON public.member_payments;
CREATE POLICY payments_insert ON public.member_payments
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS payments_update ON public.member_payments;
CREATE POLICY payments_update ON public.member_payments
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = member_payments.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS payments_delete ON public.member_payments;
CREATE POLICY payments_delete ON public.member_payments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = member_payments.gym_id AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- ═══════════════════════════════════════
-- CLASSES: Separar policies
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS classes_all ON public.classes;

DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS classes_insert ON public.classes;
CREATE POLICY classes_insert ON public.classes
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS classes_update ON public.classes;
CREATE POLICY classes_update ON public.classes
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = classes.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS classes_delete ON public.classes;
CREATE POLICY classes_delete ON public.classes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = classes.gym_id AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- ═══════════════════════════════════════
-- BOOKINGS: Separar policies
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS bookings_all ON public.class_bookings;

DROP POLICY IF EXISTS bookings_select ON public.class_bookings;
CREATE POLICY bookings_select ON public.class_bookings
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS bookings_insert ON public.class_bookings;
CREATE POLICY bookings_insert ON public.class_bookings
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS bookings_update ON public.class_bookings;
CREATE POLICY bookings_update ON public.class_bookings
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS bookings_delete ON public.class_bookings;
CREATE POLICY bookings_delete ON public.class_bookings
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = class_bookings.gym_id AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- ═══════════════════════════════════════
-- ACCESS LOGS: Separar policies
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS access_all ON public.access_logs;

DROP POLICY IF EXISTS access_select ON public.access_logs;
CREATE POLICY access_select ON public.access_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS access_insert ON public.access_logs;
CREATE POLICY access_insert ON public.access_logs
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS access_update ON public.access_logs;
CREATE POLICY access_update ON public.access_logs
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = access_logs.gym_id AND user_id = auth.uid())
    );

-- ═══════════════════════════════════════
-- SUBSCRIPTIONS: Agregar INSERT policy
-- ═══════════════════════════════════════
DROP POLICY IF EXISTS subscriptions_insert ON public.subscriptions;
CREATE POLICY subscriptions_insert ON public.subscriptions
    FOR INSERT WITH CHECK (true);
-- (Inserts via service_role en el backend API)

DROP POLICY IF EXISTS subscriptions_update ON public.subscriptions;
CREATE POLICY subscriptions_update ON public.subscriptions
    FOR UPDATE USING (true);
-- (Updates via service_role en webhook)
