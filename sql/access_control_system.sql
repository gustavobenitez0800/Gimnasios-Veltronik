-- ============================================
-- GIMNASIO VELTRONIK - SISTEMA DE CONTROL DE ACCESOS
-- Schema de producción para hardware plug & play
-- ============================================

-- ============================================
-- 1. TABLA DE DISPOSITIVOS DE ACCESO
-- Registra cada dispositivo físico (molinete, puerta, relay, lector)
-- ============================================

CREATE TABLE IF NOT EXISTS access_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    
    -- Identificación
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,  -- "Entrada principal", "Puerta lateral", etc.
    
    -- Tipo de dispositivo
    device_type TEXT NOT NULL DEFAULT 'relay'
        CHECK (device_type IN (
            'turnstile',           -- Molinete con lector integrado
            'electric_door',       -- Puerta eléctrica via relay
            'external_controller', -- Controladora externa (ZKTeco, Hikvision, etc.)
            'standalone_reader',   -- Lector independiente por red o serial
            'relay'                -- Relay genérico USB/COM
        )),
    
    -- Protocolo de comunicación
    connection_type TEXT NOT NULL DEFAULT 'simulation'
        CHECK (connection_type IN (
            'tcp_ip',        -- Conexión por red TCP/IP
            'sdk',           -- SDK del fabricante
            'api_rest',      -- Recepción por API REST / Webhooks
            'serial',        -- Puerto serial / COM
            'usb_hid',       -- USB HID (relays USB)
            'simulation'     -- Modo simulación sin hardware
        )),
    
    -- Credenciales de identificación biométrica soportadas
    supported_credentials JSONB DEFAULT '["rfid","qr"]'::jsonb,
    -- ["rfid", "nfc", "qr", "fingerprint", "facial", "pin"]
    
    -- Configuración de conexión
    connection_config JSONB DEFAULT '{}'::jsonb,
    -- TCP: { "host": "192.168.1.100", "port": 4370 }
    -- Serial: { "port": "COM3", "baudRate": 9600 }
    -- USB: { "vendorId": "0x16c0", "productId": "0x27db" }
    -- SDK: { "sdk_type": "zkteco", "device_sn": "ABC123" }
    -- API: { "webhook_path": "/api/access/device-1" }
    
    -- Configuración de apertura
    open_duration INTEGER DEFAULT 3000,    -- ms para mantener abierto
    auto_close BOOLEAN DEFAULT true,
    feedback_enabled BOOLEAN DEFAULT true,
    inverted_logic BOOLEAN DEFAULT false,  -- Para relays NC
    
    -- Comandos personalizados (para serial/USB)
    open_command JSONB,     -- [0x00, 0xFF, 0x01, 0x00] o "RELAY1_ON\r\n"
    close_command JSONB,    -- [0x00, 0xFE, 0x01, 0x00] o "RELAY1_OFF\r\n"
    
    -- Reglas de acceso
    antipassback_enabled BOOLEAN DEFAULT false,
    antipassback_minutes INTEGER DEFAULT 30,  -- Tiempo mínimo entre accesos
    max_capacity INTEGER,                      -- Capacidad máxima (NULL = sin límite)
    
    -- Horarios permitidos (NULL = 24/7)
    schedule JSONB,
    -- { "mon": {"from": "06:00", "to": "23:00"}, "tue": {...}, ... }
    
    -- Estado
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    is_online BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_access_devices_gym_id ON access_devices(gym_id);
CREATE INDEX IF NOT EXISTS idx_access_devices_status ON access_devices(status);
CREATE INDEX IF NOT EXISTS idx_access_devices_type ON access_devices(device_type);

-- RLS
ALTER TABLE access_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view devices from their gym"
    ON access_devices FOR SELECT
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can insert devices to their gym"
    ON access_devices FOR INSERT
    WITH CHECK (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

CREATE POLICY "Admin can update devices from their gym"
    ON access_devices FOR UPDATE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

CREATE POLICY "Owner can delete devices from their gym"
    ON access_devices FOR DELETE
    USING (gym_id = (SELECT gym_id FROM profiles WHERE id = auth.uid() AND role = 'owner'));


-- ============================================
-- 2. EXTENDER access_logs CON CAMPOS DE PRODUCCIÓN
-- (Agregar columnas si no existen)
-- ============================================

-- Agregar columna de dispositivo
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN device_id UUID REFERENCES access_devices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Resultado de autorización
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN authorization_result TEXT DEFAULT 'granted'
        CHECK (authorization_result IN ('granted', 'denied_expired', 'denied_inactive', 'denied_schedule', 'denied_antipassback', 'denied_capacity', 'denied_no_credential', 'denied_unknown', 'denied_suspended'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Razón de denegación (texto libre)
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN denial_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Tipo de credencial exacta usada
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN credential_type TEXT
        CHECK (credential_type IN ('manual', 'rfid', 'nfc', 'qr', 'fingerprint', 'facial', 'pin', 'api'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Código de credencial (hash RFID, código QR, etc)
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN credential_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Dirección (entrada/salida)
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN direction TEXT DEFAULT 'in'
        CHECK (direction IN ('in', 'out'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Sincronizado (para modo offline)
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN synced BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Origen del registro
DO $$ BEGIN
    ALTER TABLE access_logs ADD COLUMN source TEXT DEFAULT 'app'
        CHECK (source IN ('app', 'device', 'webhook', 'offline'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Índices adicionales
CREATE INDEX IF NOT EXISTS idx_access_logs_device_id ON access_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_auth_result ON access_logs(authorization_result);
CREATE INDEX IF NOT EXISTS idx_access_logs_direction ON access_logs(direction);
CREATE INDEX IF NOT EXISTS idx_access_logs_synced ON access_logs(synced) WHERE synced = false;


-- ============================================
-- 3. FUNCIONES RPC DE PRODUCCIÓN
-- ============================================

-- Función: Validar acceso completo
-- Verifica membresía, horario, antipassback, capacidad
CREATE OR REPLACE FUNCTION validate_member_access(
    p_gym_id UUID,
    p_member_id UUID,
    p_device_id UUID DEFAULT NULL,
    p_credential_type TEXT DEFAULT 'manual'
)
RETURNS JSONB AS $$
DECLARE
    v_member RECORD;
    v_device RECORD;
    v_last_access RECORD;
    v_current_count INTEGER;
    v_schedule JSONB;
    v_day_key TEXT;
    v_current_time TIME;
    v_from_time TIME;
    v_to_time TIME;
    v_result JSONB;
BEGIN
    -- 1. Obtener datos del socio
    SELECT * INTO v_member FROM members
    WHERE id = p_member_id AND gym_id = p_gym_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'result', 'denied_unknown',
            'reason', 'Socio no encontrado'
        );
    END IF;
    
    -- 2. Verificar estado del socio
    IF v_member.status = 'suspended' THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'result', 'denied_suspended',
            'reason', 'Socio suspendido',
            'member_name', v_member.full_name
        );
    END IF;
    
    IF v_member.status = 'inactive' THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'result', 'denied_inactive',
            'reason', 'Membresía inactiva',
            'member_name', v_member.full_name
        );
    END IF;
    
    -- 3. Verificar vencimiento de membresía
    IF v_member.membership_end IS NOT NULL AND v_member.membership_end < CURRENT_DATE THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'result', 'denied_expired',
            'reason', 'Membresía vencida desde ' || v_member.membership_end::TEXT,
            'member_name', v_member.full_name,
            'expired_date', v_member.membership_end
        );
    END IF;
    
    -- 4. Si hay dispositivo, verificar reglas del dispositivo
    IF p_device_id IS NOT NULL THEN
        SELECT * INTO v_device FROM access_devices
        WHERE id = p_device_id AND gym_id = p_gym_id AND status = 'active';
        
        IF FOUND THEN
            -- 4a. Verificar horario del dispositivo
            IF v_device.schedule IS NOT NULL THEN
                v_day_key := CASE EXTRACT(DOW FROM now())
                    WHEN 0 THEN 'sun'
                    WHEN 1 THEN 'mon'
                    WHEN 2 THEN 'tue'
                    WHEN 3 THEN 'wed'
                    WHEN 4 THEN 'thu'
                    WHEN 5 THEN 'fri'
                    WHEN 6 THEN 'sat'
                END;
                
                v_schedule := v_device.schedule -> v_day_key;
                
                IF v_schedule IS NULL OR v_schedule = 'null'::jsonb THEN
                    RETURN jsonb_build_object(
                        'authorized', false,
                        'result', 'denied_schedule',
                        'reason', 'Acceso no permitido hoy',
                        'member_name', v_member.full_name
                    );
                END IF;
                
                v_current_time := LOCALTIME;
                v_from_time := (v_schedule ->> 'from')::TIME;
                v_to_time := (v_schedule ->> 'to')::TIME;
                
                IF v_current_time < v_from_time OR v_current_time > v_to_time THEN
                    RETURN jsonb_build_object(
                        'authorized', false,
                        'result', 'denied_schedule',
                        'reason', format('Acceso permitido de %s a %s', v_schedule ->> 'from', v_schedule ->> 'to'),
                        'member_name', v_member.full_name
                    );
                END IF;
            END IF;
            
            -- 4b. Verificar antipassback
            IF v_device.antipassback_enabled THEN
                SELECT * INTO v_last_access FROM access_logs
                WHERE member_id = p_member_id
                AND gym_id = p_gym_id
                AND authorization_result = 'granted'
                AND check_in_at > now() - (v_device.antipassback_minutes || ' minutes')::INTERVAL
                ORDER BY check_in_at DESC
                LIMIT 1;
                
                IF FOUND THEN
                    RETURN jsonb_build_object(
                        'authorized', false,
                        'result', 'denied_antipassback',
                        'reason', format('Antipassback: esperar %s minutos', v_device.antipassback_minutes),
                        'member_name', v_member.full_name,
                        'last_access', v_last_access.check_in_at
                    );
                END IF;
            END IF;
            
            -- 4c. Verificar capacidad
            IF v_device.max_capacity IS NOT NULL THEN
                SELECT COUNT(*) INTO v_current_count FROM access_logs
                WHERE gym_id = p_gym_id
                AND check_in_at::DATE = CURRENT_DATE
                AND check_out_at IS NULL
                AND authorization_result = 'granted';
                
                IF v_current_count >= v_device.max_capacity THEN
                    RETURN jsonb_build_object(
                        'authorized', false,
                        'result', 'denied_capacity',
                        'reason', format('Capacidad máxima alcanzada (%s/%s)', v_current_count, v_device.max_capacity),
                        'member_name', v_member.full_name
                    );
                END IF;
            END IF;
        END IF;
    END IF;
    
    -- 5. Acceso autorizado
    RETURN jsonb_build_object(
        'authorized', true,
        'result', 'granted',
        'member_id', v_member.id,
        'member_name', v_member.full_name,
        'member_photo', v_member.photo_url,
        'membership_end', v_member.membership_end,
        'member_status', v_member.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Función: Buscar socio por credencial (unificada)
CREATE OR REPLACE FUNCTION find_member_by_credential(
    p_gym_id UUID,
    p_credential_type TEXT,
    p_credential_value TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_member RECORD;
    v_biometric RECORD;
BEGIN
    -- Buscar en member_biometrics según tipo
    IF p_credential_type IN ('rfid', 'nfc') THEN
        SELECT mb.*, m.full_name, m.status, m.membership_end, m.photo_url, m.dni
        INTO v_member
        FROM member_biometrics mb
        JOIN members m ON m.id = mb.member_id
        WHERE mb.card_code = p_credential_value
        AND mb.gym_id = p_gym_id
        AND mb.status = 'active'
        AND mb.biometric_type = 'rfid_card';
        
    ELSIF p_credential_type = 'qr' THEN
        SELECT mb.*, m.full_name, m.status, m.membership_end, m.photo_url, m.dni
        INTO v_member
        FROM member_biometrics mb
        JOIN members m ON m.id = mb.member_id
        WHERE mb.qr_code = p_credential_value
        AND mb.gym_id = p_gym_id
        AND mb.status = 'active'
        AND mb.biometric_type = 'qr_code'
        AND (mb.expires_at IS NULL OR mb.expires_at > NOW());
        
    ELSIF p_credential_type = 'fingerprint' THEN
        SELECT mb.*, m.full_name, m.status, m.membership_end, m.photo_url, m.dni
        INTO v_member
        FROM member_biometrics mb
        JOIN members m ON m.id = mb.member_id
        WHERE mb.template_hash = p_credential_value
        AND mb.gym_id = p_gym_id
        AND mb.status = 'active'
        AND mb.biometric_type = 'fingerprint';
        
    ELSE
        RETURN NULL;
    END IF;
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    RETURN jsonb_build_object(
        'member_id', v_member.member_id,
        'member_name', v_member.full_name,
        'member_status', v_member.status,
        'membership_end', v_member.membership_end,
        'photo_url', v_member.photo_url,
        'dni', v_member.dni
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Función: Registrar evento de acceso completo
CREATE OR REPLACE FUNCTION log_access_event(
    p_gym_id UUID,
    p_member_id UUID,
    p_device_id UUID DEFAULT NULL,
    p_authorization_result TEXT DEFAULT 'granted',
    p_credential_type TEXT DEFAULT 'manual',
    p_credential_id TEXT DEFAULT NULL,
    p_direction TEXT DEFAULT 'in',
    p_denial_reason TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'app',
    p_access_method TEXT DEFAULT 'manual'
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO access_logs (
        gym_id, member_id, device_id,
        check_in_at, access_method,
        authorization_result, credential_type, credential_id,
        direction, denial_reason, source, synced
    ) VALUES (
        p_gym_id, p_member_id, p_device_id,
        now(), p_access_method,
        p_authorization_result, p_credential_type, p_credential_id,
        p_direction, p_denial_reason, p_source, true
    )
    RETURNING id INTO v_log_id;
    
    -- Actualizar last_event_at del dispositivo
    IF p_device_id IS NOT NULL THEN
        UPDATE access_devices SET last_event_at = now() WHERE id = p_device_id;
    END IF;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Función: Obtener socios autorizados para caché offline
CREATE OR REPLACE FUNCTION get_authorized_members_for_cache(p_gym_id UUID)
RETURNS TABLE (
    member_id UUID,
    full_name TEXT,
    dni TEXT,
    status TEXT,
    membership_end DATE,
    photo_url TEXT,
    card_codes TEXT[],
    qr_codes TEXT[],
    fingerprint_hashes TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as member_id,
        m.full_name,
        m.dni,
        m.status,
        m.membership_end::DATE,
        m.photo_url,
        array_agg(DISTINCT mb_card.card_code) FILTER (WHERE mb_card.card_code IS NOT NULL) as card_codes,
        array_agg(DISTINCT mb_qr.qr_code) FILTER (WHERE mb_qr.qr_code IS NOT NULL) as qr_codes,
        array_agg(DISTINCT mb_fp.template_hash) FILTER (WHERE mb_fp.template_hash IS NOT NULL) as fingerprint_hashes
    FROM members m
    LEFT JOIN member_biometrics mb_card ON mb_card.member_id = m.id 
        AND mb_card.biometric_type = 'rfid_card' AND mb_card.status = 'active'
    LEFT JOIN member_biometrics mb_qr ON mb_qr.member_id = m.id 
        AND mb_qr.biometric_type = 'qr_code' AND mb_qr.status = 'active'
        AND (mb_qr.expires_at IS NULL OR mb_qr.expires_at > NOW())
    LEFT JOIN member_biometrics mb_fp ON mb_fp.member_id = m.id 
        AND mb_fp.biometric_type = 'fingerprint' AND mb_fp.status = 'active'
    WHERE m.gym_id = p_gym_id
    AND m.status IN ('active')
    AND (m.membership_end IS NULL OR m.membership_end >= CURRENT_DATE)
    GROUP BY m.id, m.full_name, m.dni, m.status, m.membership_end, m.photo_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Trigger updated_at para access_devices
CREATE OR REPLACE FUNCTION update_access_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS access_devices_updated_at ON access_devices;
CREATE TRIGGER access_devices_updated_at
    BEFORE UPDATE ON access_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_access_devices_updated_at();


-- Comentarios
COMMENT ON TABLE access_devices IS 'Dispositivos de acceso físico registrados por gimnasio. Soporta molinetes, puertas, relays, controladoras externas y lectores independientes.';
COMMENT ON FUNCTION validate_member_access IS 'Valida acceso de un socio verificando membresía, horario, antipassback y capacidad. Retorna JSON con resultado.';
COMMENT ON FUNCTION find_member_by_credential IS 'Busca un socio por credencial (RFID, QR, huella). Usado para resolver la identidad desde un dispositivo.';
COMMENT ON FUNCTION log_access_event IS 'Registra un evento de acceso completo con todos los metadatos.';
COMMENT ON FUNCTION get_authorized_members_for_cache IS 'Obtiene lista de socios autorizados con sus credenciales para caché offline.';
