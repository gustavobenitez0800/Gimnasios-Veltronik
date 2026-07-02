-- V33__Device_Enrollment.sql  (Fase 1, ladrillo 2 — docs/FASE1-PLAN.md "el bautizo")
--
-- Columnas de enrolamiento sobre device_registry (aditivas, expand/contract):
-- el equipo deja de ser anonimo cuando el dueño lo ata a una sucursal con rol y nombre.
--
--   enrolled_tenant_id  la pertenencia FUERTE (distinta de last_tenant_id, que es telemetria)
--   role                CAJA | ENCARGADO (la "Caja Madre" del local)
--   status              ACTIVE | REVOKED — revocar nunca borra: el DNI y su historial quedan
--   enrolled_by_user_id quien lo bautizo (auditoria)
--
-- Regla de integridad (en el service, no en la DB): UN solo ENCARGADO ACTIVO por sucursal.

ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS enrolled_tenant_id  uuid;
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS role                varchar(20);
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS display_name        varchar(120);
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS status              varchar(20);
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS enrolled_at         timestamp;
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS enrolled_by_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_device_registry_enrolled_tenant ON device_registry (enrolled_tenant_id);
