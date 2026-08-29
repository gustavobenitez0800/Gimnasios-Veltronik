-- V48__Auth_User_Delete_Sync.sql
--
-- BORRAR UN USUARIO EN SUPABASE QUEMABA SU EMAIL PARA SIEMPRE.
--
-- Síntoma: el dueño borra una cuenta a mano desde el panel de Supabase y después no puede
-- volver a crear una cuenta con ese mismo correo. El error que ve no dice nada útil.
--
-- LA CADENA, QUE ES LO QUE HAY QUE ENTENDER
--   1. El trigger de la V11 es AFTER INSERT y nada más: no existe la contraparte del borrado.
--   2. Al borrar de auth.users, la fila de public.app_user QUEDA COLGADA.
--   3. app_user.email es NOT NULL UNIQUE.
--   4. Al crear la cuenta de nuevo, Supabase genera un id nuevo y dispara el trigger, que
--      intenta INSERT con el mismo email → viola el UNIQUE → el trigger LANZA EXCEPCIÓN →
--      y como corre dentro de la transacción del alta, Supabase no puede crear el usuario.
--
-- El trigger no solo no limpiaba: al fallar, bloqueaba el alta. Un huérfano invisible en una
-- tabla que el dueño no ve nunca se convertía en un correo inutilizable.
--
-- Esta migración arregla las dos mitades:
--   (A) el INSERT se cura solo  → destraba los correos YA quemados;
--   (B) el DELETE limpia        → evita que vuelva a pasar.
--
-- (A) sirve aunque (B) no se pueda instalar, y eso importa: crear un trigger sobre auth.users
-- necesita permisos que el rol de migración puede no tener (lo advierte la propia V11). Por eso
-- (A) va primero y (B) va envuelto para que NO pueda tumbar el arranque del backend.


-- ─────────────────────────────────────────────────────────────────────────────
-- (A) El alta se cura sola
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  huerfanos int;
BEGIN
  -- ¿Quedó una ficha vieja con este correo, de un usuario que ya no existe en auth?
  --
  -- Si llegamos acá con un email repetido es porque el usuario de auth que lo tenía YA NO
  -- ESTÁ: auth.users no admite dos correos iguales, así que el alta habría fallado antes de
  -- llegar al trigger. O sea que esta fila es basura, no una cuenta viva.
  --
  -- Las membresías se van con él a propósito: la persona fue dada de baja, y su acceso a los
  -- gimnasios se va con ella. Es recuperable (el dueño lo vuelve a invitar y elige la sucursal)
  -- y sobre todo es VISIBLE, al revés del estado anterior, donde el alta simplemente no
  -- funcionaba y nadie sabía por qué.
  --
  -- Se borra explícitamente en vez de poner ON DELETE CASCADE en la clave foránea: la cascada
  -- también actuaría en cualquier otro borrado de app_user, presente o futuro. Acá queremos
  -- exactamente este caso y nada más.
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
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    now(),
    now()
  )
  -- Un reintento del MISMO usuario no es un error y no puede hacer fallar el alta.
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────────
-- (B) El borrado limpia
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS trigger AS $$
BEGIN
  -- Primero las membresías: tenant_membership.user_id apunta acá SIN cascada, así que sin
  -- esto el DELETE de abajo fallaría y — al correr dentro de la transacción del borrado —
  -- impediría borrar al usuario en Supabase.
  DELETE FROM public.tenant_membership WHERE user_id = old.id;
  DELETE FROM public.app_user WHERE id = old.id;
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Envuelto a propósito: crear un trigger sobre auth.users necesita permisos sobre un esquema
-- que no es nuestro, y el rol de migración puede no tenerlos (la V11 ya lo advertía). Si
-- falla, se avisa y se sigue: NUNCA puede impedir que el backend arranque. La mitad (A) ya
-- resolvió el problema del dueño; esto es la prolijidad que evita que se repita.
DO $$
BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
  CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_user();
  RAISE NOTICE 'Trigger on_auth_user_deleted instalado.';
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'No se pudo instalar on_auth_user_deleted (faltan permisos sobre auth.users). '
                 'Correr a mano desde el editor SQL de Supabase. El alta ya se autocura igual.';
END $$;
