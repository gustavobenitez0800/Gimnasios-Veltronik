-- ============================================
-- VELTRONIK - MIGRACIÓN 013: STORAGE RLS
-- ============================================
-- Configuración de Storage Buckets y Políticas RLS
-- para asegurar que un gimnasio no pueda ver las 
-- imágenes, comprobantes o documentos de otro.
-- ============================================

-- 1. Crear el bucket 'organizations' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('organizations', 'organizations', false)
ON CONFLICT (id) DO NOTHING;

-- Nota: En Supabase, la tabla storage.objects ya tiene RLS habilitado por defecto.
-- No es necesario (ni permitido) ejecutar ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Política: INSERT
-- Los usuarios solo pueden subir archivos a la carpeta de su propia organización.
-- La ruta esperada es: organizations/{org_id}/ruta/al/archivo.ext
DROP POLICY IF EXISTS "Permitir subida a la propia organización" ON storage.objects;
CREATE POLICY "Permitir subida a la propia organización"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'organizations' 
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text 
        FROM public.organization_members 
        WHERE user_id = auth.uid()
    )
);

-- 3. Política: SELECT
-- Los usuarios solo pueden leer archivos de su propia organización.
DROP POLICY IF EXISTS "Permitir lectura a la propia organización" ON storage.objects;
CREATE POLICY "Permitir lectura a la propia organización"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'organizations' 
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text 
        FROM public.organization_members 
        WHERE user_id = auth.uid()
    )
);

-- 4. Política: UPDATE
-- Los usuarios pueden actualizar archivos en su propia organización (ej. reemplazar foto).
DROP POLICY IF EXISTS "Permitir actualizar en la propia organización" ON storage.objects;
CREATE POLICY "Permitir actualizar en la propia organización"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'organizations' 
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text 
        FROM public.organization_members 
        WHERE user_id = auth.uid()
    )
);

-- 5. Política: DELETE
-- Los usuarios pueden borrar archivos en su propia organización.
DROP POLICY IF EXISTS "Permitir borrar en la propia organización" ON storage.objects;
CREATE POLICY "Permitir borrar en la propia organización"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'organizations' 
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text 
        FROM public.organization_members 
        WHERE user_id = auth.uid()
    )
);
