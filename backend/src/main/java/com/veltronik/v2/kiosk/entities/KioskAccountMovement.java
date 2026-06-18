package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Asiento del libro mayor de la cuenta corriente de un cliente (append-only). DEBT sube la deuda,
 * PAYMENT la baja. El saldo del cliente es la suma firmada de estos movimientos.
 */
@Entity
@Table(name = "kiosk_account_movement")
@Getter
@Setter
public class KioskAccountMovement extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private KioskCustomer customer;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private KioskAccountMovementType type;

    /** Importe (siempre positivo); el tipo da la dirección. */
    @Column(nullable = false)
    private BigDecimal amount;

    /** Venta que originó la deuda (si es DEBT por una venta fiada). Plano: no acopla agregados. */
    @Column(name = "sale_id")
    private UUID saleId;

    @Column(length = 255)
    private String notes;

    @Column(name = "created_by")
    private UUID createdBy;
}
