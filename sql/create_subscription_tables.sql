-- ============================================
-- CREAR TABLAS DE SUSCRIPCIÓN
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Tabla de suscripciones (Mercado Pago)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE UNIQUE,
    plan_id UUID REFERENCES plans(id),
    mp_subscription_id TEXT,
    mp_preapproval_id TEXT,
    mp_payer_id TEXT,
    mp_payer_email TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'authorized', 'past_due', 'canceled', 'cancelled')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    next_payment_date TIMESTAMPTZ,
    last_payment_date TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de pagos de suscripción (historial)
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    mp_payment_id TEXT,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'ARS',
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
    payment_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON subscriptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_gym_id ON subscription_payments(gym_id);

-- 4. Habilitar RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para usuarios
DROP POLICY IF EXISTS "Owner/Admin can view subscriptions" ON subscriptions;
CREATE POLICY "Owner/Admin can view subscriptions"
    ON subscriptions FOR SELECT
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
    );

DROP POLICY IF EXISTS "Owner can insert subscriptions" ON subscriptions;
CREATE POLICY "Owner can insert subscriptions"
    ON subscriptions FOR INSERT
    WITH CHECK (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role = 'owner')
    );

DROP POLICY IF EXISTS "Owner can update subscriptions" ON subscriptions;
CREATE POLICY "Owner can update subscriptions"
    ON subscriptions FOR UPDATE
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role = 'owner')
    );

DROP POLICY IF EXISTS "Owner/Admin can view subscription payments" ON subscription_payments;
CREATE POLICY "Owner/Admin can view subscription payments"
    ON subscription_payments FOR SELECT
    USING (
        gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
    );

-- 6. Políticas RLS para el webhook (service_role)
DROP POLICY IF EXISTS "Service role can insert subscription payments" ON subscription_payments;
CREATE POLICY "Service role can insert subscription payments"
    ON subscription_payments FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update subscriptions" ON subscriptions;
CREATE POLICY "Service role can update subscriptions"
    ON subscriptions FOR UPDATE
    TO service_role
    USING (true);

DROP POLICY IF EXISTS "Service role can insert subscriptions" ON subscriptions;
CREATE POLICY "Service role can insert subscriptions"
    ON subscriptions FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can select subscriptions" ON subscriptions;
CREATE POLICY "Service role can select subscriptions"
    ON subscriptions FOR SELECT
    TO service_role
    USING (true);

DROP POLICY IF EXISTS "Service role can select subscription payments" ON subscription_payments;
CREATE POLICY "Service role can select subscription payments"
    ON subscription_payments FOR SELECT
    TO service_role
    USING (true);

-- 7. Trigger para updated_at automático
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FIN - Las tablas están listas
-- ============================================
