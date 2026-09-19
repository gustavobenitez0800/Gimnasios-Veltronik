-- ============================================================================
-- V83 — El nombre de quien entra con Google
-- ============================================================================
-- POR QUÉ.
-- La V48 reescribió handle_new_user() para que el alta se curara sola cuando
-- quedaba una ficha huérfana con el mismo correo. Lo resolvió bien, pero al
-- reescribir la función entera se perdió lo que había arreglado la V17: sacar
-- el nombre de `full_name` (o `name`) cuando no vienen `first_name`/`last_name`.
--
-- Quién manda qué:
--   · el alta con email y contraseña (AuthService.signUp) → first_name, last_name
--   · el alta del equipo (SupabaseAdminService)          → first_name, last_name
--   · el alta con GOOGLE                                  → full_name, name
--
-- O sea que desde la V48 todo el que se registraba con Google quedaba con
-- first_name y last_name en NULL, y la pantalla de Equipo lo mostraba en blanco.
-- Nadie lo vio porque el alta no fallaba: solo quedaba el dato vacío.
--
-- Lo encontró AltaDeCuentaIntegrationTest el 2026-09-19, el primer test que
-- tuvo el alta de cuenta: registra un usuario como lo hace Google y exige que
-- la ficha tenga nombre. Ese test es lo que evita que una próxima reescritura
-- de esta función vuelva a perder algo sin que nadie se entere.
--
-- ── QUÉ HACE ──────────────────────────────────────────────────────────────
-- 1) La función junta las dos cosas: la limpieza de huérfanos de la V48 y la
--    derivación del nombre de la V17. Regla del nombre, igual que la V17: si
--    vienen first_name/last_name se respetan; si no, el primer token de
--    full_name es el nombre y el resto el apellido.
-- 2) Rellena a los que ya quedaron sin nombre. Solo toca fichas con nombre Y
--    apellido vacíos, y solo si la metadata tiene de dónde sacarlo.
--
-- ── ENDURECIDA ─────────────────────────────────────────────────────────────
-- Es SECURITY DEFINER: corre con los permisos de su dueño, no de quien la
-- dispara. Sin `SET search_path`, alguien que pudiera crear objetos en un
-- esquema que aparezca antes en la ruta podría hacerle usar SU `app_user`. Con
-- la ruta vacía se usa solo lo que está escrito con esquema (todas las tablas
-- lo están) y pg_catalog, que Postgres busca siempre. Es lo que recomienda el
-- linter de Supabase para este tipo de funciones.
--
-- ── NO TOCA auth.users ─────────────────────────────────────────────────────
-- El trigger on_auth_user_created apunta a la función por identificador, así
-- que reemplazar el cuerpo alcanza: no hace falta volver a crear el trigger, y
-- eso importa porque tocar auth.users necesita permisos que el rol de
-- migración puede no tener (ver la V48).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  huerfanos int;
  v_full  text := COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''),
                           NULLIF(new.raw_user_meta_data->>'name', ''),
                           '');
  v_first text := COALESCE(NULLIF(new.raw_user_meta_data->>'first_name', ''),
                           NULLIF(split_part(v_full, ' ', 1), ''));
  v_last  text := COALESCE(NULLIF(new.raw_user_meta_data->>'last_name', ''),
                           NULLIF(regexp_replace(v_full, '^\S+\s*', ''), ''));
BEGIN
  -- (V48) Una ficha vieja con este correo es de un usuario que ya no existe en auth:
  -- auth.users no admite dos correos iguales, así que si llegamos acá con uno repetido
  -- la fila es basura. Se va con sus membresías; ver el comentario completo en la V48.
  DELETE FROM public.tenant_membership tm
   USING public.app_user au
   WHERE tm.user_id = au.id
     AND lower(au.email) = lower(new.email)
     AND au.id <> new.id;

  DELETE FROM public.app_user
   WHERE lower(email) = lower(new.email)
     AND id <> new.id;

  GET DIAGNOSTICS huerfanos = ROW_COUNT;
  IF huerfanos > 0 THEN
    RAISE NOTICE 'app_user: se limpió una ficha huérfana del correo % antes de crear la cuenta nueva.', new.email;
  END IF;

  INSERT INTO public.app_user (id, email, first_name, last_name, created_at, updated_at)
  VALUES (new.id, new.email, v_first, v_last, now(), now())
  -- Un reintento del MISMO usuario no es un error y no puede hacer fallar el alta.
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
    'auth.users -> app_user. Limpia fichas huérfanas del mismo correo (V48) y deriva '
    'el nombre de full_name/name cuando no vienen first_name/last_name (V17). V83.';

-- Relleno de los que quedaron sin nombre. Lee auth.users, que no es nuestro esquema: si el
-- rol de migración no tiene permiso, se avisa y se sigue. El arreglo de la función ya quedó
-- aplicado arriba, que es lo que importa hacia adelante; el relleno se puede correr a mano.
DO $$
DECLARE
  rellenados int;
BEGIN
  UPDATE public.app_user au
     SET first_name = NULLIF(split_part(m.full_name, ' ', 1), ''),
         last_name  = NULLIF(regexp_replace(m.full_name, '^\S+\s*', ''), ''),
         updated_at = now()
    FROM (
      SELECT u.id,
             COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''),
                      NULLIF(u.raw_user_meta_data->>'name', '')) AS full_name
        FROM auth.users u
    ) m
   WHERE au.id = m.id
     AND m.full_name IS NOT NULL
     AND COALESCE(au.first_name, '') = ''
     AND COALESCE(au.last_name,  '') = '';

  GET DIAGNOSTICS rellenados = ROW_COUNT;
  RAISE NOTICE 'V83: % fichas de usuario recuperaron su nombre.', rellenados;
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'V83: no se pudo leer auth.users para rellenar nombres. La función ya quedó '
                 'corregida; el relleno se puede correr a mano desde el SQL Editor.';
END $$;
