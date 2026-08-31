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

    /**
     * Qué arancel se cobró. Puede ser null: los pagos migrados y los importes sueltos
     * ("le cobré una clase suelta") no tienen plan asociado.
     *
     * <p>Guardarlo —y no solo el monto— es lo que después permite responder "¿cuántos Pase
     * Libre se vendieron en agosto?" sin deducirlo del importe, que cambia cada vez que
     * suben los precios.</p>
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymPlan plan;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "payment_date", nullable = false)
    private LocalDateTime paymentDate;

    // e.g. "CASH", "CARD", "TRANSFER"
    @Column(name = "payment_method", length = 50)
    private String paymentMethod;

    /**
     * "paid" | "pending" | "cancelled", SIEMPRE en minúscula.
     *
     * <p>El default era {@code "PAID"} y el frontend guardaba {@code "paid"}: convivían las
     * dos cajas en la misma columna y la suma de ingresos del Dashboard —que comparaba
     * exacto contra {@code 'PAID'}— no contaba los pagos cargados desde la app. Ahora
     * {@code GymPaymentService} normaliza al guardar, así que la ambigüedad no se puede
     * volver a colar.</p>
     */
    @Column(nullable = false, length = 20)
    private String status = "paid";

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
