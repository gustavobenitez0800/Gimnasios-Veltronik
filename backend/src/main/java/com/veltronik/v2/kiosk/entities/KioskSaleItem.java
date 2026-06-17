package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Renglón de una venta. Parte del agregado {@link KioskSale}.
 *
 * <p><b>Snapshot inmutable:</b> guarda nombre, precio e IVA del producto al momento de vender.
 * Si después se edita o borra el producto, el histórico de la venta NO cambia. Por eso la
 * referencia a {@link KioskProduct} es opcional (puede haberse borrado).</p>
 */
@Entity
@Table(name = "kiosk_sale_item")
@Getter
@Setter
public class KioskSaleItem extends TenantAwareEntity {

    /** Venta a la que pertenece (dueño del FK del agregado). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sale_id", nullable = false)
    private KioskSale sale;

    /** Producto original. Opcional: queda null si el producto se borró luego. EAGER: el ticket
     *  siempre muestra el producto (open-in-view=false). */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "product_id")
    private KioskProduct product;

    @Column(name = "product_name_snapshot", nullable = false)
    private String productNameSnapshot;

    @Column(name = "unit_price_snapshot", nullable = false)
    private BigDecimal unitPriceSnapshot;

    @Column(name = "iva_rate_snapshot", nullable = false)
    private BigDecimal ivaRateSnapshot = new BigDecimal("21.00");

    @Column(nullable = false)
    private BigDecimal quantity;

    @Column(name = "line_total", nullable = false)
    private BigDecimal lineTotal;
}
