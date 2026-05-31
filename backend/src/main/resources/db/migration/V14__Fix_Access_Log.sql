-- V14__Fix_Access_Log.sql

DROP TABLE IF EXISTS access_log CASCADE;

-- Recrear la tabla access_log apuntando correctamente a gym_members (V10) en lugar de gym_member
CREATE TABLE access_log (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES gym_members(id) ON DELETE CASCADE,
    check_in_at TIMESTAMP NOT NULL,
    check_out_at TIMESTAMP,
    access_method VARCHAR(50) DEFAULT 'MANUAL',
    notes TEXT
);

CREATE INDEX idx_access_log_tenant ON access_log(tenant_id);
CREATE INDEX idx_access_log_member ON access_log(member_id);
CREATE INDEX idx_access_log_checkin ON access_log(tenant_id, check_in_at);
