package com.veltronik.v2.courts.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Conversación de WhatsApp entre un cliente y el bot del complejo. Una por teléfono
 * dentro del tenant (el teléfono de WhatsApp es la identidad del cliente).
 *
 * <p>Si {@code status} pasa a {@link CourtConversationStatus#HUMAN_HANDOFF}, el bot deja
 * de responder ese chat y queda para que lo atienda una persona.</p>
 */
@Entity
@Table(name = "court_conversation", uniqueConstraints = {
        @UniqueConstraint(name = "ux_court_conv_phone", columnNames = {"tenant_id", "wa_user_phone"})
})
@Getter
@Setter
public class CourtConversation extends TenantAwareEntity {

    /** Cliente del CRM, una vez identificado por teléfono. Null hasta que reserva. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private CourtCustomer customer;

    /** Teléfono de WhatsApp del cliente (formato internacional, solo dígitos). */
    @Column(name = "wa_user_phone", nullable = false, length = 30)
    private String waUserPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CourtConversationStatus status = CourtConversationStatus.ACTIVE;

    @Column(name = "handoff_at")
    private LocalDateTime handoffAt;

    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;
}
