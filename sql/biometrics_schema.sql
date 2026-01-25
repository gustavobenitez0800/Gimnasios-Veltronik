-- ============================================
-- GIMNASIO VELTRONIK - DATOS BIOMÉTRICOS
-- Esquema preparado para futuras implementaciones
-- de control de acceso biométrico
-- ============================================

-- Tabla de datos biométricos por socio
-- Almacena referencias a datos biométricos (no los datos crudos por seguridad)
CREATE TABLE IF NOT EXISTS member_biometrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    
    -- Tipo de biométrico
    biometric_type TEXT NOT NULL CHECK (biometric_type IN ('fingerprint', 'facial', 'rfid_card', 'qr_code')),
    
    -- Estado del registro
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    
    -- Identificador único del template biométrico (hash, no el dato crudo)
    template_hash TEXT,
    
    -- Para tarjetas RFID: código de la tarjeta
    card_code TEXT,
    
    -- Para QR: código único generado
    qr_code TEXT,
    
    -- Metadatos
    device_id TEXT, -- ID del dispositivo que capturó el biométrico
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- Para tarjetas temporales
    
    -- Auditoría
    enrolled_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Un socio puede tener múltiples huellas pero solo una tarjeta activa
    UNIQUE(member_id, biometric_type, template_hash)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_member_biometrics_gym_id ON member_biometrics(gym_id);
CREATE INDEX IF NOT EXISTS idx_member_biometrics_member_id ON member_biometrics(member_id);
CREATE INDEX IF NOT EXISTS idx_member_biometrics_type ON member_biometrics(biometric_type);
CREATE INDEX IF NOT EXISTS idx_member_biometrics_card_code ON member_biometrics(card_code) WHERE card_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_biometrics_qr_code ON member_biometrics(qr_code) WHERE qr_code IS NOT NULL;

-- Habilitar RLS
ALTER TABLE member_biometrics ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Staff can view biometrics from their gym"
    ON member_biometrics FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert biometrics to their gym"
    ON member_biometrics FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can update biometrics from their gym"
    ON member_biometrics FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can delete biometrics from their gym"
    ON member_biometrics FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- FUNCIONES HELPER
-- ============================================

-- Función para verificar si un socio tiene biométrico registrado
CREATE OR REPLACE FUNCTION has_biometric(
    p_member_id UUID,
    p_biometric_type TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_biometric_type IS NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM member_biometrics 
            WHERE member_id = p_member_id 
            AND status = 'active'
        );
    ELSE
        RETURN EXISTS (
            SELECT 1 FROM member_biometrics 
            WHERE member_id = p_member_id 
            AND biometric_type = p_biometric_type
            AND status = 'active'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener socio por código de tarjeta RFID
CREATE OR REPLACE FUNCTION get_member_by_card(p_card_code TEXT, p_gym_id UUID)
RETURNS TABLE (
    member_id UUID,
    member_name TEXT,
    member_status TEXT,
    membership_end DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as member_id,
        m.full_name as member_name,
        m.status as member_status,
        m.membership_end::DATE
    FROM member_biometrics mb
    JOIN members m ON m.id = mb.member_id
    WHERE mb.card_code = p_card_code
    AND mb.gym_id = p_gym_id
    AND mb.status = 'active'
    AND mb.biometric_type = 'rfid_card';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener socio por código QR
CREATE OR REPLACE FUNCTION get_member_by_qr(p_qr_code TEXT, p_gym_id UUID)
RETURNS TABLE (
    member_id UUID,
    member_name TEXT,
    member_status TEXT,
    membership_end DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as member_id,
        m.full_name as member_name,
        m.status as member_status,
        m.membership_end::DATE
    FROM member_biometrics mb
    JOIN members m ON m.id = mb.member_id
    WHERE mb.qr_code = p_qr_code
    AND mb.gym_id = p_gym_id
    AND mb.status = 'active'
    AND mb.biometric_type = 'qr_code'
    AND (mb.expires_at IS NULL OR mb.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para generar código QR único para un socio
CREATE OR REPLACE FUNCTION generate_member_qr(
    p_member_id UUID,
    p_gym_id UUID,
    p_expires_in_days INTEGER DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_qr_code TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Generar código único basado en UUID
    v_qr_code := encode(gen_random_bytes(16), 'hex');
    
    -- Calcular expiración si se especificó
    IF p_expires_in_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;
    
    -- Insertar o actualizar registro
    INSERT INTO member_biometrics (
        gym_id, member_id, biometric_type, qr_code, expires_at, status
    ) VALUES (
        p_gym_id, p_member_id, 'qr_code', v_qr_code, v_expires_at, 'active'
    )
    ON CONFLICT (member_id, biometric_type, template_hash) 
    DO UPDATE SET 
        qr_code = v_qr_code,
        expires_at = v_expires_at,
        updated_at = NOW(),
        status = 'active';
    
    RETURN v_qr_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_biometrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS biometrics_updated_at ON member_biometrics;
CREATE TRIGGER biometrics_updated_at
    BEFORE UPDATE ON member_biometrics
    FOR EACH ROW
    EXECUTE FUNCTION update_biometrics_updated_at();

-- ============================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ============================================

COMMENT ON TABLE member_biometrics IS 'Almacena datos biométricos de los socios para control de acceso. Solo guarda hashes/referencias, no datos biométricos crudos.';

COMMENT ON COLUMN member_biometrics.biometric_type IS 'Tipo de dato biométrico: fingerprint (huella), facial (reconocimiento facial), rfid_card (tarjeta), qr_code (código QR)';

COMMENT ON COLUMN member_biometrics.template_hash IS 'Hash del template biométrico. Para huellas y facial, es el hash del template generado por el SDK. No almacenar datos biométricos crudos.';

COMMENT ON COLUMN member_biometrics.card_code IS 'Código único de la tarjeta RFID/NFC asignada al socio';

COMMENT ON COLUMN member_biometrics.qr_code IS 'Código único para acceso por QR. Puede ser temporal o permanente según expires_at';

COMMENT ON FUNCTION get_member_by_card(TEXT, UUID) IS 'Busca un socio por código de tarjeta RFID para control de acceso';

COMMENT ON FUNCTION get_member_by_qr(TEXT, UUID) IS 'Busca un socio por código QR para control de acceso';

COMMENT ON FUNCTION generate_member_qr(UUID, UUID, INTEGER) IS 'Genera un código QR único para un socio. Opcionalmente puede expirar en X días.';
