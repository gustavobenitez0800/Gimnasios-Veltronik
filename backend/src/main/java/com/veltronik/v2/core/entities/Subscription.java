package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "subscriptions")
@Getter
@Setter
public class Subscription extends TenantAwareEntity {

    @Column(nullable = false, length = 50)
    private String status; // 'active', 'past_due', 'canceled'

    @Column(name = "current_period_start")
    private LocalDateTime currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "grace_period_ends_at")
    private LocalDateTime gracePeriodEndsAt;

    @Column(name = "mp_payer_email")
    private String mpPayerEmail;

    @Column(name = "mp_subscription_id")
    private String mpSubscriptionId;

    // === Resultado del último cobro (flujo riguroso: acceso solo con cobro APROBADO) ===
    @Column(name = "last_charge_status", length = 20)
    private String lastChargeStatus; // approved | rejected

    @Column(name = "last_charge_detail", length = 255)
    private String lastChargeDetail; // status_detail de MP (motivo del rechazo)

    @Column(name = "last_charge_at")
    private LocalDateTime lastChargeAt;
}
