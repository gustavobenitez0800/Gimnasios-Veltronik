-- V43__Drop_Offline_Circuit.sql
-- ============================================================================
-- BAJA TOTAL del circuito offline / local-first (decisión del dueño, 2026-07-27).
--
-- Qué se va: el sync engine (outbox + watermarks) y el login local por PIN. Todo
-- eso se construyó para que el POS del kiosco vendiera sin internet; con el
-- kiosco de baja (V41) el circuito quedó sin nada que sincronizar y sin pantalla.
--
--   sync_outbox  — cola de cambios capturados por triggers en la base local
--   sync_state   — watermarks del pull de configuración
--   cashier      — cajeros con PIN: existían SOLO para el login local sin internet
--
-- Qué se QUEDA (no es offline, es flota):
--   device_registry — identidad de cada equipo. La usan Mission Control, el
--                     rollout por anillos y el sellado de origen de cada registro.
--   update_rollout  — versión objetivo por anillo del auto-updater.
--   Las columnas credential_hash / last_sync_at / update_ring de device_registry
--   se dejan: credential_hash sigue autenticando /api/updates, y las otras dos son
--   historia inofensiva. Borrar columnas es caro y no se gana nada.
--
-- Las migraciones V34-V37 quedan como HISTORIA de Flyway.
-- Idempotente: re-ejecutarla sobre una base ya limpia es un no-op.
-- ============================================================================

DROP TABLE IF EXISTS sync_outbox CASCADE;
DROP TABLE IF EXISTS sync_state CASCADE;
DROP TABLE IF EXISTS cashier CASCADE;
