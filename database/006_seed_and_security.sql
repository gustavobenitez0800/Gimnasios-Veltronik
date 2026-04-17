-- ============================================
-- VELTRONIK - FIX 006: SEED DATA + SEGURIDAD RPC
-- ============================================
-- SAFE: No rompe nada existente.
-- Solo agrega datos y mejora seguridad en funciones.
-- ============================================

-- ═══════════════════════════════════════
-- PRE-REQ: Asegurar que plans tenga la columna is_active
-- ═══════════════════════════════════════
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.plans ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ═══════════════════════════════════════
-- SEED: Planes de suscripción
-- ═══════════════════════════════════════
INSERT INTO public.plans (name, price, features, is_active)
SELECT 'Inicial', 0, '["Hasta 50 socios", "Panel básico", "Control de acceso"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Inicial');

INSERT INTO public.plans (name, price, features, is_active)
SELECT 'Profesional', 35000, '["Socios ilimitados", "Panel completo", "Clases y reservas", "Reportes", "Equipo (hasta 5)", "Retención de socios", "Soporte prioritario"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Profesional');

INSERT INTO public.plans (name, price, features, is_active)
SELECT 'Empresarial', 65000, '["Todo de Profesional", "Multi-sucursal", "Equipo ilimitado", "API personalizada", "Soporte 24/7", "Auditoría completa"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Empresarial');

-- ═══════════════════════════════════════
-- SEGURIDAD: Mejorar funciones RPC
-- ═══════════════════════════════════════
-- IMPORTANTE: DROP antes de CREATE porque PostgreSQL no permite
-- cambiar el return type con CREATE OR REPLACE.

-- 1) invite_team_member
DROP FUNCTION IF EXISTS invite_team_member(UUID, TEXT, TEXT);

CREATE FUNCTION invite_team_member(
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
    FROM public.organization_members
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

    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (target_user_id, org_id, invite_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = invite_role;

    UPDATE public.profiles SET gym_id = org_id WHERE id = target_user_id AND gym_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) update_team_member_role
DROP FUNCTION IF EXISTS update_team_member_role(UUID, UUID, TEXT);

CREATE FUNCTION update_team_member_role(
    org_id UUID,
    target_user_id UUID,
    new_role TEXT
)
RETURNS VOID AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede cambiar roles.';
    END IF;

    IF new_role = 'owner' THEN
        RAISE EXCEPTION 'No se puede asignar el rol de dueño.';
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés cambiar tu propio rol.';
    END IF;

    UPDATE public.organization_members
    SET role = new_role
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) remove_team_member
DROP FUNCTION IF EXISTS remove_team_member(UUID, UUID);

CREATE FUNCTION remove_team_member(
    org_id UUID,
    target_user_id UUID
)
RETURNS VOID AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'owner' THEN
        RAISE EXCEPTION 'Solo el dueño puede eliminar miembros del equipo.';
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés eliminarte a vos mismo del equipo.';
    END IF;

    DELETE FROM public.organization_members
    WHERE organization_id = org_id AND user_id = target_user_id AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════
-- STORAGE: Bucket para fotos de socios
-- ═══════════════════════════════════════
-- Si falla, crealo manualmente: Dashboard > Storage > New Bucket > "member-photos"
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'member-photos',
        'member-photos',
        true,
        5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Storage bucket: crear manualmente desde Dashboard > Storage';
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS storage_member_photos_insert ON storage.objects;
    CREATE POLICY storage_member_photos_insert ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'member-photos' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage insert policy skipped';
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS storage_member_photos_select ON storage.objects;
    CREATE POLICY storage_member_photos_select ON storage.objects
        FOR SELECT USING (bucket_id = 'member-photos');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage select policy skipped';
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS storage_member_photos_update ON storage.objects;
    CREATE POLICY storage_member_photos_update ON storage.objects
        FOR UPDATE USING (bucket_id = 'member-photos' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage update policy skipped';
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS storage_member_photos_delete ON storage.objects;
    CREATE POLICY storage_member_photos_delete ON storage.objects
        FOR DELETE USING (bucket_id = 'member-photos' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage delete policy skipped';
END $$;
