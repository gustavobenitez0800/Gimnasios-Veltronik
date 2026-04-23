-- ============================================
-- 007: LIMPIEZA DE DATOS Y RESTRICCIONES
-- ============================================
-- Limpia registros huérfanos y agrega constraints
-- para prevenir duplicados.
-- ============================================

-- ─── 1. Eliminar membresías huérfanas ───
-- Eliminar organization_members donde el dueño original
-- (el que invitó) ya no existe, dejando al usuario invitado
-- con acceso a un gym que ya no debería ver.

-- Primero, veamos los gyms que no tienen dueño (owner)
-- y eliminemos las membresías de tipo staff/admin a esos gyms
DELETE FROM organization_members
WHERE role IN ('staff', 'admin', 'reception')
  AND organization_id NOT IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE role = 'owner'
  );

-- ─── 2. Eliminar membresías duplicadas ───
-- Mantener solo la de mayor jerarquía por (user_id, organization_id)
DELETE FROM organization_members a
USING organization_members b
WHERE a.user_id = b.user_id
  AND a.organization_id = b.organization_id
  AND a.ctid < b.ctid
  AND (
    CASE a.role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'staff' THEN 1 ELSE 0 END
  ) <= (
    CASE b.role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'staff' THEN 1 ELSE 0 END
  );

-- ─── 3. Agregar constraint UNIQUE para prevenir duplicados ───
-- Un usuario solo puede tener UNA membresía por organización
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_user_per_org'
  ) THEN
    ALTER TABLE organization_members
    ADD CONSTRAINT unique_user_per_org 
    UNIQUE (user_id, organization_id);
  END IF;
END $$;

-- ─── 4. Verificar resultado ───
SELECT 
  om.user_id,
  p.full_name,
  p.email,
  om.role,
  g.name as gym_name,
  g.type as organization_type
FROM organization_members om
LEFT JOIN profiles p ON p.id = om.user_id
LEFT JOIN gyms g ON g.id = om.organization_id
ORDER BY om.user_id, om.role;
