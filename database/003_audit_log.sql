-- ============================================
-- VELTRONIK - FIX 003: AUDIT LOG + FUNCIÓN
-- ============================================
-- La función get_activity_log() es un placeholder vacío.
-- Este script crea la tabla audit_log y reemplaza la función.
-- ============================================

-- Tabla de auditoría
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,           -- create, update, delete, checkin, checkout, payment, invite, role_change
    entity_type TEXT NOT NULL,      -- member, payment, class, booking, access, team, settings
    entity_id UUID,                 -- ID del registro afectado
    details JSONB DEFAULT '{}',     -- Datos adicionales (ej: cambios realizados)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_audit_org ON public.audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_date ON public.audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log(entity_type, entity_id);

-- RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = audit_log.organization_id
            AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = audit_log.organization_id
            AND user_id = auth.uid()
        )
    );

-- IMPORTANTE: Primero DROP la función vieja porque cambió el tipo de retorno
DROP FUNCTION IF EXISTS get_activity_log(UUID, INT);

-- Recrear con la implementación real
CREATE FUNCTION get_activity_log(org_id UUID, log_limit INT DEFAULT 50)
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
        COALESCE(p.full_name, 'Sistema')::TEXT AS user_name,
        al.created_at
    FROM public.audit_log al
    LEFT JOIN public.profiles p ON p.id = al.user_id
    WHERE al.organization_id = org_id
    ORDER BY al.created_at DESC
    LIMIT log_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función helper para registrar auditoría desde el frontend
CREATE OR REPLACE FUNCTION log_audit_event(
    org_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_log (organization_id, user_id, action, entity_type, entity_id, details)
    VALUES (org_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
