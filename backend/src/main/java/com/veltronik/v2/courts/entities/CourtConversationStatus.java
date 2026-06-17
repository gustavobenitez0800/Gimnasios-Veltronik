package com.veltronik.v2.courts.entities;

/** Estado de una conversación de WhatsApp con el bot. */
public enum CourtConversationStatus {
    /** El bot responde automáticamente. */
    ACTIVE,
    /** El bot se calló: lo atiende una persona del complejo (handoff). */
    HUMAN_HANDOFF
}
