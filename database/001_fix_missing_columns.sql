-- ============================================
-- VELTRONIK - FIX 001: COLUMNAS FALTANTES
-- ============================================
-- Agrega columnas que el código usa pero no existen en el schema.
-- SAFE: Usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================

-- 1. gyms: agregar plan_id (usado por create-subscription.js línea 221-226)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gyms' AND column_name = 'plan_id'
    ) THEN
        ALTER TABLE public.gyms ADD COLUMN plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. subscriptions: agregar mp_preapproval_id (usado por webhook línea 129, 136)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'mp_preapproval_id'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN mp_preapproval_id TEXT;
    END IF;
END $$;

-- 3. subscriptions: agregar mp_payer_email (usado por webhook línea 131, create-subscription línea 203)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'mp_payer_email'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN mp_payer_email TEXT;
    END IF;
END $$;

-- 4. subscriptions: agregar retry_count (usado por webhook línea 140, 333, 381, 384)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN retry_count INT DEFAULT 0;
    END IF;
END $$;

-- 5. Índice único parcial en subscriptions.mp_preapproval_id para idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_mp_preapproval
    ON public.subscriptions(mp_preapproval_id)
    WHERE mp_preapproval_id IS NOT NULL;

-- 6. Índice en subscriptions.gym_id para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON public.subscriptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 7. Índice en organization_members para RLS (usado en TODAS las policies)
CREATE INDEX IF NOT EXISTS idx_org_members_org_user
    ON public.organization_members(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user
    ON public.organization_members(user_id);
