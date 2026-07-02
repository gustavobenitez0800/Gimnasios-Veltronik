-- V34__Sync_Foundations.sql  (Fase 1, ladrillo 4 — el sync engine, ADR-010)
--
-- 1) Credencial de equipo: el enroll emite un secreto de larga vida que viaja UNA sola
--    vez al equipo; aca se guarda su hash SHA-256. /api/sync/** autentica con
--    X-Device-Id + X-Device-Key (headless: el sync corre sin humanos logueados).
ALTER TABLE device_registry ADD COLUMN IF NOT EXISTS credential_hash varchar(64);

-- 2) Bandeja de salida del sync (outbox). Viaja en la cadena UNICA de migraciones
--    (regla: un solo esquema para nube y local), pero solo el modo local la usa:
--    los triggers de captura se crean unicamente bajo el perfil `local`
--    (LocalOutboxTriggers, callback afterMigrate). En la nube queda vacia.
--    Sin entidad JPA: el motor la maneja por JDBC (es infraestructura, no dominio).
CREATE TABLE IF NOT EXISTS sync_outbox (
    id          bigserial PRIMARY KEY,      -- orden de captura = orden de envio
    table_name  varchar(64)  NOT NULL,
    row_id      uuid         NOT NULL,
    op          varchar(10)  NOT NULL,      -- v1: INSERT (eventos append-only)
    payload     jsonb        NOT NULL,      -- to_jsonb(NEW): la fila exacta
    created_at  timestamp    NOT NULL DEFAULT now()
);
