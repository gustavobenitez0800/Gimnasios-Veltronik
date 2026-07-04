-- V37__Device_Sync_Health_And_Ring.sql  (Fase 1, ladrillo 7 — Mission Control + anillos)
--
-- last_sync_at: cuándo el equipo empujó datos por última vez (distinto de last_seen_at,
--   que es el heartbeat de cualquier request). Es la señal HONESTA de "los datos de esta
--   caja están frescos en la nube" — el nucleo del web-espejo y de Mission Control.
--
-- update_ring: anillo de despliegue del rollout escalonado (ADR-007). 0=piloto,
--   1=amigos, 2=todos. NULL = todos (el default seguro: un equipo sin asignar recibe
--   updates recien en la ultima ola).
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS last_sync_at timestamp;
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS update_ring  smallint;
