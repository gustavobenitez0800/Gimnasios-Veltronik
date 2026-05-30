package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "tenant_payment")
@Getter
@Setter
public class TenantPayment extends TenantAwareEntity {

    @Column(name = "mp_payment_id", unique = true)
    private String mpPaymentId;
    
    @Column(name = "mp_preapproval_id")
    private String mpPreapprovalId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false, length = 20)
    private String status; // APPROVED, REJECTED, PENDING

    @Column(name = "payment_date", nullable = false)
    private LocalDateTime paymentDate;
}
