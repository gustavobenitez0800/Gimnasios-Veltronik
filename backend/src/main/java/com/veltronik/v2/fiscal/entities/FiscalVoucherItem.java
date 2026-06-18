package com.veltronik.v2.fiscal.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/** Renglón de un comprobante. Parte del agregado {@link FiscalVoucher}. */
@Entity
@Table(name = "fiscal_voucher_item")
@Getter
@Setter
public class FiscalVoucherItem extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "voucher_id", nullable = false)
    private FiscalVoucher voucher;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false)
    private BigDecimal unitPrice;

    @Column(name = "iva_rate", nullable = false)
    private BigDecimal ivaRate = new BigDecimal("21.00");

    @Column(nullable = false)
    private BigDecimal subtotal;
}
