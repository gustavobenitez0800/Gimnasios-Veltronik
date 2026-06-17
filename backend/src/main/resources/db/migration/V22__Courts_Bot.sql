-- V22__Courts_Bot.sql
-- Fase 3 del vertical canchas: bot de WhatsApp (Meta Cloud API) + Gemini Flash.
-- El bot atiende por el número del complejo, reserva turnos (esperando seña) y deriva a
-- una persona cuando no entiende (handoff). Autónomo 24/7.

-- (1) Config del bot por tenant en court_settings.
--     wa_phone_number_id ENRUTA el webhook entrante de Meta → tenant (de ahí el índice único).
--     wa_access_token: token de Graph API para responderle al cliente (sensible; nunca se expone al front).
ALTER TABLE court_settings ADD COLUMN bot_enabled        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE court_settings ADD COLUMN wa_phone_number_id VARCHAR(40);
ALTER TABLE court_settings ADD COLUMN wa_access_token    TEXT;
ALTER TABLE court_settings ADD COLUMN bot_instructions   TEXT;

CREATE UNIQUE INDEX ux_court_settings_wa_phone
    ON court_settings(wa_phone_number_id)
    WHERE wa_phone_number_id IS NOT NULL;

-- (2) Conversación por cliente (1 por teléfono de WhatsApp dentro del tenant).
--     status ACTIVE = el bot responde; HUMAN_HANDOFF = el bot se calla y atiende una persona.
CREATE TABLE court_conversation (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    customer_id UUID,
    wa_user_phone VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    handoff_at TIMESTAMP,
    last_message_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_conv_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenant(id)         ON DELETE CASCADE,
    CONSTRAINT fk_court_conv_customer FOREIGN KEY (customer_id) REFERENCES court_customer(id) ON DELETE SET NULL,
    CONSTRAINT ux_court_conv_phone UNIQUE (tenant_id, wa_user_phone)
);

-- (3) Mensajes de la conversación (memoria del bot). Guardamos solo el texto de cliente y
--     asistente; el ida y vuelta de function-calling vive en memoria durante una respuesta.
--     wa_message_id da idempotencia: Meta reentrega notificaciones y no queremos procesar 2 veces.
CREATE TABLE court_conversation_message (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    role VARCHAR(12) NOT NULL,          -- USER | ASSISTANT
    content TEXT NOT NULL,
    wa_message_id VARCHAR(80),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_court_msg_tenant FOREIGN KEY (tenant_id)       REFERENCES tenant(id)             ON DELETE CASCADE,
    CONSTRAINT fk_court_msg_conv   FOREIGN KEY (conversation_id) REFERENCES court_conversation(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ux_court_msg_wamid ON court_conversation_message(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_court_msg_conv     ON court_conversation_message(conversation_id, created_at);
CREATE INDEX idx_court_conv_tenant  ON court_conversation(tenant_id);
