-- V11__Supabase_Auth_Sync_Trigger.sql

-- 1. Eliminar la columna password_hash ya que Supabase se encargará de las contraseñas
ALTER TABLE app_user DROP COLUMN IF EXISTS password_hash;

-- 2. Asegurarnos que la tabla auth.users puede ser leída/escrita (Normalmente Supabase ya la tiene)
-- Creamos la función del trigger que se ejecutará en el esquema de Auth de Supabase
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.app_user (id, email, first_name, last_name, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    now(),
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el Trigger en la tabla auth.users
-- Primero intentamos borrarlo por si ya existía de la V1
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Nota: Para que el trigger en auth.users funcione en migraciones locales,
-- Flyway necesita permisos. En Supabase en la nube, el rol de migración
-- usualmente tiene acceso. Si falla por permisos, el trigger debe aplicarse desde la consola SQL de Supabase.
