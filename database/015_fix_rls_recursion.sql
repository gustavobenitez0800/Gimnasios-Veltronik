-- ============================================
-- VELTRONIK - FIX 015: RLS INFINITE RECURSION FIX
-- ============================================
-- Elimina la recursión infinita en organization_members
-- que estaba causando que los gimnasios desaparezcan.
-- ============================================

-- PASO 1: Remover la policy circular
DROP POLICY IF EXISTS org_members_select ON public.organization_members;

-- PASO 2: Crear policy simple sin recursión
-- (TeamPage y otras vistas de equipo funcionan igual
-- gracias a las funciones RPC SECURITY DEFINER)
CREATE POLICY org_members_select ON public.organization_members
    FOR SELECT USING (user_id = auth.uid());
