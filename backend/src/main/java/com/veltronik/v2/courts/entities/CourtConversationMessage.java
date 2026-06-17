package com.veltronik.v2.courts.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Un mensaje de la conversación (memoria del bot). Solo texto de cliente/asistente; el
 * ida y vuelta de function-calling con Gemini vive en memoria durante una respuesta.
 *
 * <p>{@code waMessageId} (el id de Meta) da idempotencia: si Meta reentrega la
 * notificación, no se procesa dos veces (índice único parcial).</p>
 */
@Entity
@Table(name = "court_conversation_message")
@Getter
@Setter
public class CourtConversationMessage extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private CourtConversation conversation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private CourtMessageRole role;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    /** Id del mensaje en Meta (solo para los entrantes del cliente). Idempotencia. */
    @Column(name = "wa_message_id", length = 80)
    private String waMessageId;
}
