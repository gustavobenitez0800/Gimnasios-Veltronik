-- ============================================
-- PASO 1: Primero ejecutá SOLO ESTA QUERY para ver los gyms
-- y encontrar el gym_id del cliente que pagó
-- ============================================

SELECT id, name, status, trial_ends_at, created_at
FROM gyms
ORDER BY created_at DESC;

-- ============================================
-- PASO 2: Una vez que tengas el gym_id, 
-- reemplazá 'PONER_GYM_ID_AQUI' con el UUID real
-- y ejecutá DESDE AQUÍ HACIA ABAJO
-- ============================================

-- REEMPLAZÁ este valor con el gym_id real del cliente:
DO $$
DECLARE
    target_gym_id UUID := 'PONER_GYM_ID_AQUI';
    target_email TEXT;
BEGIN
    -- Obtener el email del owner del gym
    SELECT p.email INTO target_email
    FROM profiles p
    WHERE p.gym_id = target_gym_id AND p.role = 'owner'
    LIMIT 1;

    -- Crear suscripción activa
    INSERT INTO subscriptions (
        gym_id,
        mp_payer_email,
        status,
        last_payment_date,
        next_payment_date,
        created_at,
        updated_at
    ) VALUES (
        target_gym_id,
        COALESCE(target_email, 'manual@activation.com'),
        'active',
        now(),
        now() + INTERVAL '1 month',
        now(),
        now()
    )
    ON CONFLICT (gym_id) DO UPDATE SET
        status = 'active',
        last_payment_date = now(),
        next_payment_date = now() + INTERVAL '1 month',
        updated_at = now();

    -- Asegurar que el gym esté activo
    UPDATE gyms
    SET status = 'active', updated_at = now()
    WHERE id = target_gym_id;

    RAISE NOTICE 'Cliente activado correctamente: gym_id = %', target_gym_id;
END $$;
