-- V32__Device_Registry.sql  (Fase 1, ladrillo 1 — docs/FASE1-PLAN.md)
--
-- Registro de equipos: una fila por instalación física conocida. El id ES el DNI del
-- equipo (el mismo UUID que viaja en X-Device-Id y se estampa en origin_device_id desde
-- V31). last_tenant_id es telemetría (última sucursal vista, validada), SIN FK dura:
-- los eventos y equipos deben poder llegar en cualquier orden.
--
-- El enrolamiento (ladrillo 2) agregará sus columnas (rol, nombre, credencial) de forma
-- aditiva en una migración posterior — expand/contract.

CREATE TABLE IF NOT EXISTS device_registry (
    id               uuid PRIMARY KEY,        -- el DNI del equipo (generado en el dispositivo)
    created_at       timestamp NOT NULL,      -- primera vez visto
    updated_at       timestamp NOT NULL,
    last_seen_at     timestamp NOT NULL,      -- última señal de vida (throttleada a 5 min)
    last_tenant_id   uuid,                    -- última sucursal vista (telemetría)
    last_app_version varchar(32)              -- versión de la app (base del rollout por anillos)
);

-- El listado del dueño consulta por sucursal.
CREATE INDEX IF NOT EXISTS idx_device_registry_last_tenant ON device_registry (last_tenant_id);
