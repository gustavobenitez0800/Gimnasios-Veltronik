-- ============================================
-- SUBSCRIPTION LIFECYCLE MIGRATION
-- Adds grace period and retry support
-- ============================================

-- Add grace period columns to subscriptions table
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- ============================================
-- FUNCTION: Check and enforce subscription status
-- This should run daily via pg_cron or manually
-- ============================================

CREATE OR REPLACE FUNCTION check_subscription_status()
RETURNS void AS $$
DECLARE
    gym_record RECORD;
BEGIN
    -- 1. Block gyms whose trial expired AND have no active subscription
    UPDATE gyms g
    SET status = 'blocked', updated_at = now()
    WHERE g.status = 'active'
      AND g.trial_ends_at IS NOT NULL
      AND g.trial_ends_at < now()
      AND NOT EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.gym_id = g.id
            AND s.status IN ('active', 'pending')
      );

    -- 2. Block gyms whose grace period has ended without payment
    UPDATE gyms g
    SET status = 'blocked', updated_at = now()
    FROM subscriptions s
    WHERE s.gym_id = g.id
      AND s.status = 'past_due'
      AND s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at < now()
      AND g.status = 'active';

    -- Also update the subscription status to canceled
    UPDATE subscriptions s
    SET status = 'canceled', updated_at = now()
    WHERE s.status = 'past_due'
      AND s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- OPTIONAL: Enable pg_cron for daily checks
-- Run this manually in Supabase SQL Editor:
-- ============================================
-- SELECT cron.schedule(
--     'check-subscription-status',
--     '0 3 * * *',  -- Every day at 3:00 AM UTC
--     'SELECT check_subscription_status()'
-- );

-- ============================================
-- RLS Policy: Allow service role to manage subscriptions
-- (Webhook uses service role key)
-- ============================================

-- Allow webhook (service_role) to insert subscription payments
DROP POLICY IF EXISTS "Service role can insert subscription payments" ON subscription_payments;
CREATE POLICY "Service role can insert subscription payments"
    ON subscription_payments FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Allow webhook (service_role) to update subscriptions
DROP POLICY IF EXISTS "Service role can update subscriptions" ON subscriptions;
CREATE POLICY "Service role can update subscriptions"
    ON subscriptions FOR UPDATE
    TO service_role
    USING (true);

-- Allow webhook (service_role) to insert/upsert subscriptions
DROP POLICY IF EXISTS "Service role can insert subscriptions" ON subscriptions;
CREATE POLICY "Service role can insert subscriptions"
    ON subscriptions FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ============================================
-- END OF MIGRATION
-- ============================================
