-- ============================================
-- V17: FIX USER NAME SYNC (auth.users -> app_user)
-- ============================================
-- Problema: el signup de Veltronik guarda UN solo campo en la metadata de Supabase
-- (raw_user_meta_data->>'full_name'), pero handle_new_user (V11/V12) leía
-- 'first_name'/'last_name' — claves que casi nunca existen. Resultado: app_user con
-- nombres vacíos/NULL y la UI mostrando "Usuario" / el prefijo del email.
--
-- Esta migración:
--   1) Reescribe handle_new_user para derivar first/last desde full_name (o 'name'),
--      respetando first_name/last_name si vinieran explícitos. Regla de split: el
--      primer token es el nombre; el resto, el apellido (igual que el ETL de socios).
--   2) Backfillea las filas existentes con nombre vacío/NULL. Idempotente: solo toca
--      filas sin nombre y solo si hay full_name en la metadata.

-- 1) Trigger function corregida ---------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full  text := COALESCE(NEW.raw_user_meta_data->>'full_name',
                             NEW.raw_user_meta_data->>'name', '');
    v_first text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
                             NULLIF(split_part(v_full, ' ', 1), ''));
    v_last  text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
                             NULLIF(regexp_replace(v_full, '^\S+\s*', ''), ''));
BEGIN
    INSERT INTO public.app_user (id, email, first_name, last_name, created_at, updated_at)
    VALUES (NEW.id, NEW.email, v_first, v_last, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user() IS
    'Sincroniza auth.users -> app_user, derivando first/last desde full_name (V17).';

-- 2) Backfill de filas existentes (idempotente) -----------------------------
UPDATE public.app_user au
SET first_name = NULLIF(split_part(m.full_name, ' ', 1), ''),
    last_name  = NULLIF(regexp_replace(m.full_name, '^\S+\s*', ''), ''),
    updated_at = NOW()
FROM (
    SELECT u.id,
           COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') AS full_name
    FROM auth.users u
) m
WHERE au.id = m.id
  AND m.full_name IS NOT NULL AND m.full_name <> ''
  AND COALESCE(au.first_name, '') = ''
  AND COALESCE(au.last_name,  '') = '';
