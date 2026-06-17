package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Pago de una venta. Parte del agregado {@link KioskSale}. Una venta puede tener varios
 * (pago mixto: parte efectivo, parte tarjeta). Solo los {@code CASH} entran al arqueo de caja.
 */
@Entity
@Table(name = "kiosk_sale_payment")
@Getter
@Setter
public class KioskSalePayment extends TenantAwareEntity {

    /** Venta a la que pertenece (dueño del FK del agregado). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sale_id", nullable = false)
    private KioskSale sale;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private KioskPaymentMethod method;

    @Column(nullable = false)
    private BigDecimal amount;
}
