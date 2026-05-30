-- V7__Fix_Subscriptions_Table.sql

-- Drop the columns that are not in Subscription.java
ALTER TABLE subscriptions DROP COLUMN IF EXISTS plan_name;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS amount;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS currency;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS next_payment_date;

-- Add the columns that are in Subscription.java
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mp_payer_email VARCHAR(255);
