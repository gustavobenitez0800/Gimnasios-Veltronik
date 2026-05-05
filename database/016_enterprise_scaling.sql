-- ==============================================================================
-- MIGRACIÓN 016: ESCALAMIENTO ENTERPRISE (PERFORMANCE & MULTI-TENANT OPTIMIZATION)
-- ==============================================================================
-- Este script es 100% SEGURO para correr en producción.
-- NO elimina datos. Usa 'IF NOT EXISTS' para evitar errores.
-- Propósito: Acelerar las consultas para un entorno Multi-Tenant (miles de registros)
-- ==============================================================================

-- 0. VERIFICACIÓN Y CREACIÓN DE EXTENSIONES NECESARIAS
-- Debe ir primero para que los índices GIN puedan usarla.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. ÍNDICES CRÍTICOS PARA AISLAMIENTO MULTI-TENANT (GYM_ID)
-- Las consultas siempre filtran por gym_id, así que debe tener un índice en todas partes.
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_member_payments_gym_id ON member_payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_classes_gym_id ON classes(gym_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_gym_id ON class_bookings(gym_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_gym_id ON access_logs(gym_id);
CREATE INDEX IF NOT EXISTS idx_profiles_gym_id ON profiles(gym_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(organization_id);

-- 2. ÍNDICES DE BÚSQUEDA RÁPIDA (Filtros de interfaz)
-- Los usuarios buscan socios por DNI o Nombre frecuentemente.
CREATE INDEX IF NOT EXISTS idx_members_dni ON members(dni);
CREATE INDEX IF NOT EXISTS idx_members_name ON members USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- 3. ÍNDICES PARA FINANZAS Y DASHBOARD (Fechas)
-- Acelera inmensamente la generación del Dashboard ("Ganancias de este mes")
CREATE INDEX IF NOT EXISTS idx_payments_date ON member_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON member_payments(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON subscriptions(gym_id);

-- Se omiten restricciones CHECK agresivas para evitar conflictos con datos legacy en producción.

-- ==============================================================================
-- NOTA POST-DESPLIEGUE:
-- Ejecutar este script en Supabase -> SQL Editor.
-- Esto preparará la base de datos para manejar >100,000 registros fluidamente.
-- El RLS ya está siendo manejado (migraciones 005 a 015), esto complementa la velocidad.
-- ==============================================================================
