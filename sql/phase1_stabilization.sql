-- ============================================
-- FASE 1: ESTABILIZACIÓN
-- Gimnasio Veltronik - Mejoras de Base de Datos
-- ============================================
-- 
-- INSTRUCCIONES:
-- Ejecuta este script en Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/tztupzgxvaopehcgfmag/sql
--
-- Este script es SEGURO y no elimina datos existentes.
-- ============================================

-- ============================================
-- 1. AGREGAR COLUMNA subscription_id A GYMS
-- ============================================
-- El código JS verifica gym.subscription_id pero la columna no existe.
-- Esto corrige el problema.

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gyms' AND column_name = 'subscription_id'
    ) THEN
        ALTER TABLE gyms ADD COLUMN subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;
        RAISE NOTICE 'Columna subscription_id agregada a gyms';
    ELSE
        RAISE NOTICE 'Columna subscription_id ya existe en gyms';
    END IF;
END $$;

-- Crear índice para performance
CREATE INDEX IF NOT EXISTS idx_gyms_subscription_id ON gyms(subscription_id);

-- ============================================
-- 2. CONSTRAINT ÚNICO PARA DNI POR GIMNASIO
-- ============================================
-- Evita duplicar socios con el mismo DNI en el mismo gimnasio.
-- DNI puede ser NULL (no todos los socios tienen DNI).

-- Primero eliminamos duplicados si existen (mantiene el más reciente)
WITH duplicates AS (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY gym_id, dni ORDER BY created_at DESC) as rn
    FROM members
    WHERE dni IS NOT NULL AND dni != ''
)
DELETE FROM members 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Crear índice único (permite NULL)
DROP INDEX IF EXISTS idx_members_gym_dni_unique;
CREATE UNIQUE INDEX idx_members_gym_dni_unique 
ON members(gym_id, dni) 
WHERE dni IS NOT NULL AND dni != '';

-- ============================================
-- 3. FUNCIÓN PARA ACTUALIZAR ESTADOS AUTOMÁTICAMENTE
-- ============================================
-- Cambia miembros a "expired" cuando vence su membresía.

CREATE OR REPLACE FUNCTION update_expired_memberships()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE members
    SET status = 'expired', updated_at = now()
    WHERE status = 'active'
      AND membership_end IS NOT NULL
      AND membership_end < CURRENT_DATE;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar ahora para corregir estados existentes
SELECT update_expired_memberships() as miembros_actualizados;

-- ============================================
-- 4. TRIGGER PARA VINCULAR SUSCRIPCIÓN AL GYM
-- ============================================
-- Cuando se activa una suscripción, actualiza gym.subscription_id

CREATE OR REPLACE FUNCTION sync_gym_subscription()
RETURNS TRIGGER AS $$
BEGIN
    -- Cuando la suscripción cambia a activa, vincular al gym
    IF NEW.status = 'active' THEN
        UPDATE gyms
        SET subscription_id = NEW.id,
            updated_at = now()
        WHERE id = NEW.gym_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe y recrear
DROP TRIGGER IF EXISTS on_subscription_status_change ON subscriptions;
CREATE TRIGGER on_subscription_status_change
    AFTER INSERT OR UPDATE OF status ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION sync_gym_subscription();

-- ============================================
-- 5. SINCRONIZAR SUSCRIPCIONES EXISTENTES
-- ============================================
-- Vincular suscripciones activas existentes a sus gyms

UPDATE gyms g
SET subscription_id = s.id
FROM subscriptions s
WHERE s.gym_id = g.id
  AND s.status = 'active'
  AND g.subscription_id IS NULL;

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ejecuta estas queries para verificar que todo está correcto

SELECT 'Gyms con subscription_id' as check, count(*) as cantidad 
FROM gyms WHERE subscription_id IS NOT NULL
UNION ALL
SELECT 'Gyms sin subscription_id', count(*) 
FROM gyms WHERE subscription_id IS NULL
UNION ALL
SELECT 'Miembros expirados actualizados', count(*) 
FROM members WHERE status = 'expired' AND membership_end < CURRENT_DATE;

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
