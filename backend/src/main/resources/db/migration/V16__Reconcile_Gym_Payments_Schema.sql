-- V16__Reconcile_Gym_Payments_Schema.sql
--
-- PROPÓSITO: alinear las migraciones Flyway con el esquema REAL de producción.
-- La tabla gym_payments fue parcheada a mano en producción (tiene notes/period_start/
-- period_end y NO tiene description), pero V10 la creó con `description` y nunca agregó
-- esas columnas. Sin esta reconciliación, una base limpia construida desde cero fallaría
-- al arrancar (spring.jpa.hibernate.ddl-auto=validate), porque la entidad GymPayment
-- espera notes / period_start / period_end.
--
-- IDEMPOTENTE Y SEGURA en ambos escenarios:
--   * Producción  → las columnas nuevas ya existen y `description` no → prácticamente no-op.
--   * Base fresca → existe `description` y faltan las nuevas → las crea, copia y limpia.
-- No modifica datos salvo copiar description→notes cuando corresponde.
--
-- NOTA: reemplaza al antiguo V16 ("Realtime Sync V1→V2"), que NUNCA se aplicó
-- (flyway_schema_history llegaba hasta V15) y era inviable: V1 y V2 son proyectos
-- Supabase SEPARADOS, por lo que triggers cross-DB son imposibles. La estrategia de
-- datos definida es CORTE CON FECHA (ETL final + V2 como única fuente de verdad).

-- 1. Asegurar las columnas que la entidad GymPayment espera (no-op si ya existen).
ALTER TABLE gym_payments ADD COLUMN IF NOT EXISTS notes        VARCHAR(255);
ALTER TABLE gym_payments ADD COLUMN IF NOT EXISTS period_start TIMESTAMP;
ALTER TABLE gym_payments ADD COLUMN IF NOT EXISTS period_end   TIMESTAMP;

-- 2. Si todavía existe la columna heredada `description` (caso: base fresca desde V10),
--    migrar su contenido a `notes` y eliminarla. En producción no existe → no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'gym_payments'
          AND column_name  = 'description'
    ) THEN
        UPDATE gym_payments
           SET notes = description
         WHERE notes IS NULL
           AND description IS NOT NULL;

        ALTER TABLE gym_payments DROP COLUMN description;
    END IF;
END $$;
