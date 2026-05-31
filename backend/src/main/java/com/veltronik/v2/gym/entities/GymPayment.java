package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
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
}
