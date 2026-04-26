-- ============================================
-- MIGRACIÓN 011: TRIGGERS PARA AUDIT LOG
-- ============================================
-- Descripción:
-- Automatiza el registro de actividad (Activity Log) en la tabla `audit_log`
-- cada vez que se crea, actualiza o elimina un miembro, un pago o una clase.
-- Esto asegura que el "Historial de Actividad" en la pestaña Equipo
-- funcione de manera 100% segura e independiente del frontend.
-- ============================================

-- 1. Función general del trigger para auditoría
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    action_type TEXT;
    entity_id UUID;
    org_id UUID;
    details JSONB;
BEGIN
    action_type := TG_OP; -- 'INSERT', 'UPDATE', or 'DELETE'
    
    -- Determinar el ID y OrgID dependiendo de la operación
    IF TG_OP = 'DELETE' THEN
        entity_id := OLD.id;
        -- Asume que todas las tablas trackeadas tienen gym_id
        org_id := OLD.gym_id;
        details := row_to_json(OLD)::jsonb;
    ELSE
        entity_id := NEW.id;
        org_id := NEW.gym_id;
        details := row_to_json(NEW)::jsonb;
    END IF;

    -- Filtrar detalles para que no guarden todo el objeto gigante,
    -- o guardarlo y luego el frontend decide qué mostrar.
    -- (Aquí lo guardamos para depuración futura, pero podríamos hacerlo '{}').
    
    -- Mapeo visual de la acción para el frontend
    DECLARE
        mapped_action TEXT;
    BEGIN
        IF TG_OP = 'INSERT' THEN
            mapped_action := 'create_' || TG_TABLE_NAME;
        ELSIF TG_OP = 'UPDATE' THEN
            mapped_action := 'update_' || TG_TABLE_NAME;
        ELSE
            mapped_action := 'delete_' || TG_TABLE_NAME;
        END IF;

        INSERT INTO public.audit_log (organization_id, user_id, action, entity_type, entity_id, details)
        VALUES (
            org_id,
            auth.uid(), -- Usuario autenticado que hizo el cambio
            mapped_action,
            TG_TABLE_NAME, -- members, member_payments, classes, etc.
            entity_id,
            details
        );
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Limpiar triggers viejos si existen
DROP TRIGGER IF EXISTS audit_members_trigger ON members;
DROP TRIGGER IF EXISTS audit_payments_trigger ON member_payments;
DROP TRIGGER IF EXISTS audit_classes_trigger ON classes;

-- 3. Crear triggers para las tablas principales
CREATE TRIGGER audit_members_trigger
AFTER INSERT OR UPDATE OR DELETE ON members
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_payments_trigger
AFTER INSERT OR UPDATE OR DELETE ON member_payments
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_classes_trigger
AFTER INSERT OR UPDATE OR DELETE ON classes
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Opcional: Trigger para access_logs (check-ins)
DROP TRIGGER IF EXISTS audit_access_trigger ON access_logs;
CREATE TRIGGER audit_access_trigger
AFTER INSERT ON access_logs
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
