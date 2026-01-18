-- ============================================
-- GIMNASIO VELTRONIK - CONTROL DE ACCESO
-- Sistema de Check-in/Check-out y Asistencia
-- ============================================

-- Tabla de registros de acceso (check-in/check-out)
CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_out_at TIMESTAMPTZ,
    access_method TEXT DEFAULT 'manual' CHECK (access_method IN ('manual', 'qr', 'card', 'biometric')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_access_logs_gym_id ON access_logs(gym_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_member_id ON access_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_check_in_at ON access_logs(check_in_at);
CREATE INDEX IF NOT EXISTS idx_access_logs_date ON access_logs((check_in_at::date));

-- Habilitar RLS
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para access_logs
CREATE POLICY "Staff can view access logs from their gym"
    ON access_logs FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert access logs to their gym"
    ON access_logs FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can update access logs from their gym"
    ON access_logs FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can delete access logs from their gym"
    ON access_logs FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- Función para obtener estadísticas de asistencia por hora
CREATE OR REPLACE FUNCTION get_hourly_attendance_stats(target_gym_id UUID, days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    hour_of_day INTEGER,
    total_visits BIGINT,
    avg_visits NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(HOUR FROM check_in_at)::INTEGER as hour_of_day,
        COUNT(*)::BIGINT as total_visits,
        ROUND(COUNT(*)::NUMERIC / days_back, 1) as avg_visits
    FROM access_logs
    WHERE gym_id = target_gym_id
    AND check_in_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY EXTRACT(HOUR FROM check_in_at)
    ORDER BY hour_of_day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener estadísticas de asistencia por día de la semana
CREATE OR REPLACE FUNCTION get_daily_attendance_stats(target_gym_id UUID, days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    day_of_week INTEGER,
    day_name TEXT,
    total_visits BIGINT,
    avg_visits NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(DOW FROM check_in_at)::INTEGER as day_of_week,
        CASE EXTRACT(DOW FROM check_in_at)
            WHEN 0 THEN 'Domingo'
            WHEN 1 THEN 'Lunes'
            WHEN 2 THEN 'Martes'
            WHEN 3 THEN 'Miércoles'
            WHEN 4 THEN 'Jueves'
            WHEN 5 THEN 'Viernes'
            WHEN 6 THEN 'Sábado'
        END as day_name,
        COUNT(*)::BIGINT as total_visits,
        ROUND(COUNT(*)::NUMERIC / GREATEST(days_back / 7, 1), 1) as avg_visits
    FROM access_logs
    WHERE gym_id = target_gym_id
    AND check_in_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY EXTRACT(DOW FROM check_in_at)
    ORDER BY day_of_week;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
