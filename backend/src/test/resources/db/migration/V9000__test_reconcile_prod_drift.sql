-- ============================================================================
-- TEST-ONLY — NO ES UNA MIGRACIÓN DE PRODUCCIÓN.
-- ============================================================================
-- Vive en src/test/resources → NUNCA entra al JAR de producción (Flyway de prod solo ve
-- src/main/resources). Corre al final (V9000 > V28) SOLO durante `mvn test`.
--
-- Propósito: reconciliar el DRIFT de esquema de producción que NO está descrito por ninguna
-- migración — columnas agregadas fuera de Flyway durante el cutover V1→V2, o perdidas en el
-- rename gym_member→gym_members. Producción las tiene (por eso arranca), pero una base recién
-- migrada no. Esto permite que ApplicationBootIT valide el contexto COMPLETO contra un esquema
-- equivalente al real, atrapando regresiones de cualquier vertical (el objetivo del test).
--
-- ⚠️ El drift de gym es un bug latente PREEXISTENTE (independiente del kiosco): una base nueva
-- (staging/DR/otra región) no se puede reconstruir solo desde las migraciones. El fix definitivo
-- es una migración correctiva de prod (ADD COLUMN IF NOT EXISTS) — ver handoff.

-- gym_members: la entidad GymMember tiene ~18 columnas, pero las migraciones construyen una
-- tabla mínima; el resto se agregó a prod fuera de Flyway durante el cutover. Tipos calcados de
-- la entidad (text vs varchar importa para ddl-auto=validate). Las que ya existan: IF NOT EXISTS las saltea.
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
