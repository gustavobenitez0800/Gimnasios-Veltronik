-- V35__Sync_State.sql  (Fase 1, ladrillo 4 tajada 2 — ADR-010)
--
-- Estado del sincronizador del lado LOCAL: hoy, el watermark del pull de config
-- ('pull_watermark' = hasta que updated_at ya bajamos). Clave/valor a proposito:
-- los proximos marcadores (p.ej. por tabla) entran sin migracion nueva.
-- Viaja en la cadena unica de migraciones; en la nube queda vacia (como sync_outbox).

CREATE TABLE IF NOT EXISTS sync_state (
    key        varchar(64) PRIMARY KEY,
    value      text        NOT NULL,
    updated_at timestamp   NOT NULL DEFAULT now()
);
