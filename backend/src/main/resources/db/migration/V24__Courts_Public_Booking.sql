-- V24__Courts_Public_Booking.sql
-- Reservas online: cada complejo comparte un link publico donde el cliente reserva solo
-- (ve disponibilidad, pide turno → queda esperando sena). Automatiza el mostrador, sin Meta
-- ni IA. El token impredecible identifica al complejo sin login.

ALTER TABLE court_settings ADD COLUMN public_booking_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE court_settings ADD COLUMN public_token    VARCHAR(40);
ALTER TABLE court_settings ADD COLUMN whatsapp_number VARCHAR(30);

-- El token enruta el link publico → tenant (se resuelve sin contexto de tenant).
CREATE UNIQUE INDEX ux_court_settings_public_token
    ON court_settings(public_token)
    WHERE public_token IS NOT NULL;
