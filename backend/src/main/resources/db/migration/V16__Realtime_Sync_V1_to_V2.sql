-- V16__Realtime_Sync_V1_to_V2.sql

-- ==========================================
-- 1. CATCH-UP: Recuperar datos huérfanos
-- ==========================================
-- Insertar o actualizar socios que se crearon en V1 después de la migración V10
INSERT INTO gym_members (
    id, tenant_id, first_name, last_name, email, phone, document, 
    is_active, membership_start, membership_end, created_at, updated_at
)
SELECT 
    id, tenant_id, first_name, last_name, email, phone, dni, 
    (status = 'ACTIVE'), membership_start, membership_end, created_at, updated_at
FROM gym_member
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    document = EXCLUDED.document,
    is_active = EXCLUDED.is_active,
    membership_start = EXCLUDED.membership_start,
    membership_end = EXCLUDED.membership_end,
    updated_at = EXCLUDED.updated_at;

-- Insertar o actualizar pagos que se crearon en V1 después de la migración V10
INSERT INTO gym_payments (
    id, tenant_id, member_id, amount, payment_date, payment_method, status, description, created_at, updated_at
)
SELECT 
    id, tenant_id, member_id, amount, payment_date, payment_method, status, notes, created_at, updated_at
FROM member_payment
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    member_id = EXCLUDED.member_id,
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date,
    payment_method = EXCLUDED.payment_method,
    status = EXCLUDED.status,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at;

-- ==========================================
-- 2. FUNCIONES DE SINCRONIZACIÓN EN TIEMPO REAL
-- ==========================================

-- Función para mantener gym_members sincronizado con gym_member (V1 -> V2)
CREATE OR REPLACE FUNCTION sync_v1_gym_member_to_v2()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM gym_members WHERE id = OLD.id;
        RETURN OLD;
    END IF;

    INSERT INTO gym_members (
        id, tenant_id, first_name, last_name, email, phone, document, 
        is_active, membership_start, membership_end, created_at, updated_at
    )
    VALUES (
        NEW.id, NEW.tenant_id, NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.dni, 
        (NEW.status = 'ACTIVE'), NEW.membership_start, NEW.membership_end, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        document = EXCLUDED.document,
        is_active = EXCLUDED.is_active,
        membership_start = EXCLUDED.membership_start,
        membership_end = EXCLUDED.membership_end,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para mantener gym_payments sincronizado con member_payment (V1 -> V2)
CREATE OR REPLACE FUNCTION sync_v1_member_payment_to_v2()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM gym_payments WHERE id = OLD.id;
        RETURN OLD;
    END IF;

    INSERT INTO gym_payments (
        id, tenant_id, member_id, amount, payment_date, payment_method, status, description, created_at, updated_at
    )
    VALUES (
        NEW.id, NEW.tenant_id, NEW.member_id, NEW.amount, NEW.payment_date, NEW.payment_method, NEW.status, NEW.notes, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        member_id = EXCLUDED.member_id,
        amount = EXCLUDED.amount,
        payment_date = EXCLUDED.payment_date,
        payment_method = EXCLUDED.payment_method,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 3. TRIGGERS
-- ==========================================

DROP TRIGGER IF EXISTS trigger_sync_gym_member ON gym_member;
CREATE TRIGGER trigger_sync_gym_member
AFTER INSERT OR UPDATE OR DELETE ON gym_member
FOR EACH ROW
EXECUTE FUNCTION sync_v1_gym_member_to_v2();

DROP TRIGGER IF EXISTS trigger_sync_member_payment ON member_payment;
CREATE TRIGGER trigger_sync_member_payment
AFTER INSERT OR UPDATE OR DELETE ON member_payment
FOR EACH ROW
EXECUTE FUNCTION sync_v1_member_payment_to_v2();
