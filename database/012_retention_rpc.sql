-- ============================================
-- VELTRONIK - MIGRACIÓN 012: RETENTION RPC
-- ============================================
-- RPC para evitar descargar toda la tabla members
-- al calcular las métricas de retención.
-- ============================================

CREATE OR REPLACE FUNCTION get_retention_data(p_org_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
    v_total_members INT;
    v_active_members INT;
    v_inactive_members INT;
    v_retention_rate INT;
    
    v_expiring_soon JSON;
    v_at_risk JSON;
BEGIN
    -- Contadores básicos
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'active'),
        COUNT(*) FILTER (WHERE status = 'inactive')
    INTO v_total_members, v_active_members, v_inactive_members
    FROM members
    WHERE gym_id = p_org_id;

    -- Tasa de retención
    IF v_total_members > 0 THEN
        v_retention_rate := ROUND((v_active_members::numeric / v_total_members::numeric) * 100);
    ELSE
        v_retention_rate := 0;
    END IF;

    -- Socios por vencer en los próximos 7 días (array JSON)
    SELECT COALESCE(json_agg(json_build_object(
        'id', id,
        'full_name', full_name,
        'membership_end', membership_end,
        'phone', phone
    )), '[]'::json)
    INTO v_expiring_soon
    FROM members
    WHERE gym_id = p_org_id
      AND membership_end IS NOT NULL
      AND membership_end >= CURRENT_DATE
      AND membership_end <= CURRENT_DATE + INTERVAL '7 days'
    ORDER BY membership_end ASC;

    -- Socios en riesgo: Activos pero sin pagos en los últimos 30 días
    SELECT COALESCE(json_agg(json_build_object(
        'id', m.id,
        'full_name', m.full_name,
        'phone', m.phone
    )), '[]'::json)
    INTO v_at_risk
    FROM members m
    WHERE m.gym_id = p_org_id
      AND m.status = 'active'
      AND NOT EXISTS (
          SELECT 1 
          FROM member_payments p 
          WHERE p.member_id = m.id 
            AND p.status = 'paid'
            AND p.payment_date >= CURRENT_DATE - INTERVAL '30 days'
      )
    ORDER BY m.full_name ASC;

    -- Construir resultado final
    result := json_build_object(
        'total_members', v_total_members,
        'active_members', v_active_members,
        'inactive_members', v_inactive_members,
        'retention_rate', v_retention_rate,
        'expiring_soon', v_expiring_soon,
        'at_risk', v_at_risk
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
