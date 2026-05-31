package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "gym_payments")
@Getter
@Setter
public class GymPayment extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "member_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymMember member;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "payment_date", nullable = false)
    private LocalDateTime paymentDate;

    // e.g. "CASH", "CARD", "TRANSFER"
    @Column(name = "payment_method", length = 50)
    private String paymentMethod;

    // e.g. "PAID", "PENDING", "CANCELLED"
    @Column(nullable = false, length = 20)
    private String status = "PAID";

    private String notes;

    @Column(name = "period_start")
    private LocalDateTime periodStart;

    @Column(name = "period_end")
    private LocalDateTime periodEnd;

    /**
     * Acepta {@code member_id} (snake_case) que envía el frontend al crear un pago.
     * Sin esto, Jackson no encontraba dónde mapearlo y el pago se guardaba SIN socio
     * (la columna es nullable → quedaba huérfano en silencio). Crea una referencia mínima;
     * {@code GymPaymentService.saveForCurrentTenant} la resuelve y verifica que el socio
     * pertenezca al tenant. Write-only: no se serializa (el DTO de salida ya expone el socio).
     */
    @com.fasterxml.jackson.annotation.JsonProperty("member_id")
    public void setMemberId(java.util.UUID memberId) {
        if (memberId != null) {
            GymMember m = new GymMember();
            m.setId(memberId);
            this.member = m;
        }
    }
}
