-- ============================================
-- VELTRONIK - SECURITY RLS IMPROVEMENTS
-- ============================================
-- Ejecutar en Supabase SQL Editor
-- Este script mejora las políticas RLS existentes
-- ============================================

-- ============================================
-- 1. ELIMINAR POLÍTICA PERMISIVA DE GYMS
-- ============================================
-- La política actual permite a cualquier usuario crear gyms ilimitados
-- La reemplazamos con una política que limita a 1 gym por usuario

DROP POLICY IF EXISTS "Authenticated users can create gyms" ON gyms;

-- Nueva política: Solo usuarios sin gym pueden crear uno
CREATE POLICY "Users can create one gym only"
    ON gyms FOR INSERT
    TO authenticated
    WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND gym_id IS NOT NULL
        )
    );

-- ============================================
-- 2. POLÍTICAS DE SUBSCRIPTION_PAYMENTS
-- ============================================
-- Proteger historial de pagos de suscripción

-- Solo dueños/admins pueden ver pagos de suscripción de su gym
DROP POLICY IF EXISTS "Owner/Admin can view subscription payments" ON subscription_payments;

CREATE POLICY "Owner/Admin can view subscription payments"
    ON subscription_payments FOR SELECT
    TO authenticated
    USING (
        gym_id = (
            SELECT gym_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Solo el service role (backend) puede insertar pagos
-- Los pagos vienen del webhook, no del frontend
CREATE POLICY "Only service role can insert subscription payments"
    ON subscription_payments FOR INSERT
    TO authenticated
    WITH CHECK (false); -- Bloquea inserts desde el cliente

-- ============================================
-- 3. PROTECCIÓN ADICIONAL PARA PROFILES
-- ============================================
-- Asegurar que nadie pueda cambiar su rol a owner

CREATE OR REPLACE FUNCTION check_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- No permitir cambio de rol excepto si es el primer owner del gym
    IF OLD.role != NEW.role THEN
        -- Solo permitir si es la primera asignación de gym (onboarding)
        IF OLD.gym_id IS NOT NULL OR NEW.role = 'owner' THEN
            -- Verificar que hay un gym nuevo siendo asignado
            IF OLD.gym_id IS NULL AND NEW.gym_id IS NOT NULL AND NEW.role = 'owner' THEN
                -- Permitido: asignación inicial de owner durante onboarding
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'Role change not allowed';
            END IF;
        END IF;
    END IF;
    
    -- No permitir cambiar gym_id después de asignado
    IF OLD.gym_id IS NOT NULL AND NEW.gym_id != OLD.gym_id THEN
        RAISE EXCEPTION 'Gym change not allowed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_profile_update_trigger ON profiles;
CREATE TRIGGER check_profile_update_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_profile_update();

-- ============================================
-- 4. ÍNDICE PARA PERFORMANCE DE RLS
-- ============================================
-- Mejorar performance de las queries de RLS

CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_id_gym_id ON profiles(id, gym_id);

-- ============================================
-- FIN DE SCRIPT DE SEGURIDAD
-- ============================================
-- Verifica que todo se aplicó correctamente:
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
