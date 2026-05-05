DO $$ 
DECLARE
  v_user_id UUID;
  v_gym_id UUID;
  v_plan_id UUID;
BEGIN
  -- Find user id
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'lu7elp@yahoo.com.ar' LIMIT 1;
  
  IF v_user_id IS NULL THEN
    -- Fallback to profiles just in case
    SELECT id, gym_id INTO v_user_id, v_gym_id FROM profiles WHERE email = 'lu7elp@yahoo.com.ar' LIMIT 1;
  END IF;

  -- Find gym_id
  IF v_gym_id IS NULL THEN
    SELECT organization_id INTO v_gym_id FROM organization_members WHERE user_id = v_user_id LIMIT 1;
  END IF;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gym no encontrado para el usuario lu7elp@yahoo.com.ar';
  END IF;

  -- Get a plan ID (e.g., Profesional)
  SELECT id INTO v_plan_id FROM plans LIMIT 1;

  -- Cancel existing subscriptions for this gym
  UPDATE subscriptions SET status = 'canceled' WHERE gym_id = v_gym_id;

  -- Insert active subscription for 30 days
  INSERT INTO subscriptions (
    gym_id, plan_id, status, current_period_end, mp_payer_email, mp_preapproval_id, created_at, updated_at
  ) VALUES (
    v_gym_id, v_plan_id, 'active', NOW() + INTERVAL '30 days', 'lu7elp@yahoo.com.ar', 'manual_activation', NOW(), NOW()
  );

  -- Ensure gym status is active
  UPDATE gyms SET status = 'active' WHERE id = v_gym_id;
END $$;
