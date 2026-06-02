-- V19: estado del último cobro de la suscripción.
-- Habilita el flujo RIGUROSO: el acceso se otorga SOLO cuando un cobro fue APROBADO
-- (no al autorizar la tarjeta). Estas columnas guardan el resultado del último cobro
-- para que el frontend muestre el estado real (procesando / aprobado / rechazado + motivo).
-- Aditivo y nullable → seguro de aplicar en producción sin downtime de datos.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_charge_status  VARCHAR(20);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_charge_detail  VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_charge_at      TIMESTAMP;
