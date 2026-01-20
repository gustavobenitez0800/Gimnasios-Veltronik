-- ============================================
-- MIGRACIÓN: Agregar días de asistencia a socios
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Agregar columna attendance_days (array de enteros 0-6 representando días de la semana)
-- 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS attendance_days INTEGER[] DEFAULT '{}';

-- Crear índice para búsquedas por día
CREATE INDEX IF NOT EXISTS idx_members_attendance_days ON members USING GIN (attendance_days);

-- Comentario descriptivo
COMMENT ON COLUMN members.attendance_days IS 'Días de la semana que el socio asiste (0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb)';

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ejecutar para verificar que la columna fue creada:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'attendance_days';
