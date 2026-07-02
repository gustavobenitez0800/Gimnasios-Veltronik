-- V31__Origin_Device_Id.sql  (Fase 0 de la V3 local-first — ADR-002 "DNI de equipo")
--
-- Agrega origin_device_id a TODAS las tablas tenant-aware: el id de la instalación que
-- originó cada registro. Es la base de la trazabilidad del sync engine (ADR-003):
--   - la sucursal de un equipo es una ETIQUETA reasignable; el DNI del equipo NUNCA miente
--   - un error de enrolamiento se repara re-etiquetando por origin_device_id, sin perder datos
--
-- Nullable a propósito: los registros históricos y las escrituras sin equipo identificado
-- (web del dueño, webhooks de MP, jobs) quedan/insertan con NULL. Sin FK todavía: la tabla
-- de equipos enrolados nace con el enrolamiento (Fase 1).
--
-- Aditiva e idempotente (ADD COLUMN IF NOT EXISTS): NO-OP si ya existe. Sin índices por
-- ahora — ninguna query la usa; se indexará cuando el sync engine la consulte (regla
-- expand/contract: primero agregar, los refinamientos después).

-- core
ALTER TABLE subscriptions            ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE tenant_payment           ADD COLUMN IF NOT EXISTS origin_device_id uuid;

-- gym
ALTER TABLE access_log               ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE class_booking            ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE gym_class                ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE gym_members              ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE gym_payments             ADD COLUMN IF NOT EXISTS origin_device_id uuid;

-- kiosk
ALTER TABLE kiosk_account_movement   ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_cash_session       ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_category           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_customer           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_product            ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_purchase           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_purchase_item      ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_sale               ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_sale_item          ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_sale_payment       ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_settings           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_stock_movement     ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE kiosk_supplier           ADD COLUMN IF NOT EXISTS origin_device_id uuid;

-- fiscal
ALTER TABLE fiscal_config            ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE fiscal_point_of_sale     ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE fiscal_voucher           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE fiscal_voucher_item      ADD COLUMN IF NOT EXISTS origin_device_id uuid;

-- courts (vertical marcado para eliminación en Fase 4; mientras viva, mantiene el
-- contrato de TenantAwareEntity — ddl validate exige la columna en todas sus tablas)
ALTER TABLE court                    ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_booking            ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_conversation      ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_conversation_message ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_customer           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_price_rule         ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_recurring_booking  ADD COLUMN IF NOT EXISTS origin_device_id uuid;
ALTER TABLE court_settings           ADD COLUMN IF NOT EXISTS origin_device_id uuid;
