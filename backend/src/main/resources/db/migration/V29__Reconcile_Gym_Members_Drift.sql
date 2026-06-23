-- V29__Reconcile_Gym_Members_Drift.sql
-- Reconciliación de DRIFT de esquema en gym_members: columnas que la entidad GymMember espera
-- pero que NINGUNA migración creaba. Se agregaron a producción FUERA de Flyway durante el cutover
-- V1→V2 (la V4 las puso en gym_member SINGULAR; el rename a gym_members PLURAL no las arrastró).
-- Consecuencia: prod arrancaba (tiene las columnas), pero una base nueva (staging/DR/otra región)
-- NO se podía reconstruir solo desde las migraciones → fallaba ddl-auto=validate.
--
-- Idempotente y segura: ADD COLUMN IF NOT EXISTS → NO-OP en prod (ya las tiene), las crea en bases
-- limpias. Tipos calcados de la entidad (text vs varchar importa para la validación de Hibernate).
-- Con esto el esquema de prod queda 100% descrito por migraciones (regla post-outage del 18/06).

ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS phone             varchar(255);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS document          varchar(255);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS membership_start  timestamp;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS membership_end    timestamp;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS attendance_days   text;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS notes             text;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS birth_date        text;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS address           varchar(255);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS emergency_contact varchar(255);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS emergency_phone   varchar(50);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS gender            varchar(50);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS objectives        text;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS photo_url         varchar(500);
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS user_id           uuid;
