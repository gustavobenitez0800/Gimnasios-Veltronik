-- V21__Courts_Cash_And_Alias.sql
-- Cierra el "loop del dinero" del vertical de canchas: cómo y cuándo entró cada peso.
-- (1) método de cobro de la seña y del saldo + monto/fecha del saldo en court_booking,
-- (2) alias/CBU del complejo en court_settings para el WhatsApp "pedir seña".

-- court_booking: la seña ya tenía monto+fecha; ahora también el MÉTODO. El saldo cobrado
-- al cerrar el turno se registra aparte (amount_paid + payment_method + paid_at) para que
-- la caja del día no mezcle ni duplique los dos eventos de cobro.
ALTER TABLE court_booking ADD COLUMN deposit_method  VARCHAR(20);
ALTER TABLE court_booking ADD COLUMN amount_paid     NUMERIC(12,2);
ALTER TABLE court_booking ADD COLUMN payment_method  VARCHAR(20);
ALTER TABLE court_booking ADD COLUMN paid_at         TIMESTAMP;

-- Caja del día: la consulta agrupa por fecha de cobro (deposit_paid_at / paid_at).
CREATE INDEX idx_court_booking_deposit_paid ON court_booking(tenant_id, deposit_paid_at);
CREATE INDEX idx_court_booking_paid_at      ON court_booking(tenant_id, paid_at);

-- court_settings: alias/CBU para la seña por transferencia (mensaje de WhatsApp 1-click).
ALTER TABLE court_settings ADD COLUMN payment_alias VARCHAR(120);
