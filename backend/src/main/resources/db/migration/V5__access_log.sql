-- V5__access_log.sql
-- Tabla de control de acceso (check-in / check-out)

CREATE TABLE access_log (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    member_id UUID NOT NULL REFERENCES gym_member(id),
    check_in_at TIMESTAMP NOT NULL,
    check_out_at TIMESTAMP,
    access_method VARCHAR(50) DEFAULT 'manual',
    notes TEXT
);

CREATE INDEX idx_access_log_tenant ON access_log(tenant_id);
CREATE INDEX idx_access_log_member ON access_log(member_id);
CREATE INDEX idx_access_log_checkin ON access_log(tenant_id, check_in_at);
