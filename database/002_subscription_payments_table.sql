-- ============================================
-- VELTRONIK - FIX 002: TABLA subscription_payments
-- ============================================
-- El webhook (webhook-mercadopago.js líneas 257-284) usa esta tabla
-- para guardar pagos de suscripción con idempotencia,
-- pero NUNCA fue creada en el schema original.
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
    mp_payment_id TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'ARS',
    status TEXT DEFAULT 'pending',        -- approved, pending, rejected, refunded
    payment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único para idempotencia (evita procesar mismo pago 2 veces)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_payments_mp_id
    ON public.subscription_payments(mp_payment_id);

-- Índice para búsquedas por gimnasio
CREATE INDEX IF NOT EXISTS idx_sub_payments_gym
    ON public.subscription_payments(gym_id);

CREATE INDEX IF NOT EXISTS idx_sub_payments_status
    ON public.subscription_payments(status);

-- RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Los pagos de suscripción solo son visibles para miembros de la org (owner/admin)
CREATE POLICY subscription_payments_select ON public.subscription_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = subscription_payments.gym_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Solo el service_role (backend) puede insertar/actualizar pagos de suscripción
-- (No se necesita policy de INSERT/UPDATE porque el webhook usa service_role key)
