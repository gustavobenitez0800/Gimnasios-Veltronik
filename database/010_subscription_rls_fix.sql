-- ============================================
-- MIGRACIÓN 010: FIX CRÍTICO RLS SUBSCRIPTIONS
-- ============================================
-- Descripción:
-- Reemplaza las políticas vulnerables `FOR UPDATE USING (true)` y `FOR INSERT WITH CHECK (true)`
-- en la tabla `subscriptions`, las cuales permitían a cualquier usuario autenticado modificar
-- el estado de cualquier suscripción de la plataforma.
--
-- Ahora, solo el owner o admin de la organización específica puede modificar/crear,
-- (mientras que los webhooks de Mercado Pago siguen funcionando porque usan el SERVICE_ROLE
-- que hace bypass al RLS).
-- ============================================

-- 1. Eliminar políticas inseguras actuales
DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
DROP POLICY IF EXISTS subscriptions_update ON subscriptions;

-- 2. Crear políticas de seguridad robustas para INSERT y UPDATE
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members 
        WHERE organization_id = subscriptions.gym_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
);

CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM organization_members 
        WHERE organization_id = subscriptions.gym_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
);

-- Nota: La política SELECT ya era segura, pero se mantiene:
-- CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (
--    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = subscriptions.gym_id AND user_id = auth.uid())
-- );
