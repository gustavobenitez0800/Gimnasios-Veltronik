package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Producto del kiosco.
 *
 * <p><b>Stock como cache, no como verdad:</b> {@code stockQuantity} es un valor denormalizado
 * para mostrar rápido en el POS; la fuente de verdad es la suma firmada de
 * {@link KioskStockMovement}. El motor de ventas lo decrementa con un UPDATE atómico
 * (no read-modify-write) para no perder actualizaciones bajo ventas concurrentes.</p>
 *
 * <p>El stock NO es restrictivo: una venta nunca se bloquea por falta de stock (decisión de
 * rubro) — puede quedar negativo y eso es la señal de "ajustá el inventario".</p>
 */
@Entity
@Table(name = "kiosk_product")
@Getter
@Setter
public class KioskProduct extends TenantAwareEntity {

    /**
     * Rubro. Opcional (un producto puede no tener categoría). EAGER porque el DTO siempre
     * expone categoría y la app corre con {@code open-in-view=false} (no se puede inicializar
     * lazy en el mapper); las listas usan JOIN FETCH para no caer en N+1. Mismo criterio que
     * las asociaciones de {@code CourtBooking}.
     */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id")
    private KioskCategory category;

    @Column(nullable = false)
    private String name;

    /** Código de barras (EAN-13 u otro). Único por tenant cuando existe (índice parcial). */
    @Column(length = 64)
    private String barcode;

    /** Costo de reposición, para calcular margen y rentabilidad. */
    @Column(name = "cost_price")
    private BigDecimal costPrice;

    @Column(name = "sale_price", nullable = false)
    private BigDecimal salePrice;

    /** Cache del stock. La verdad es Σ {@link KioskStockMovement}. Puede ser negativo. */
    @Column(name = "stock_quantity", nullable = false)
    private BigDecimal stockQuantity = BigDecimal.ZERO;

    /** Umbral de reposición: por debajo de esto, alerta de stock bajo. */
    @Column(name = "min_stock", nullable = false)
    private BigDecimal minStock = BigDecimal.ZERO;

    /** true = se vende por peso (fiambre, verdura): la cantidad es decimal (kg). */
    @Column(name = "is_weighable", nullable = false)
    private boolean weighable = false;

    /** true = servicio (recarga virtual / SUBE): no descuenta stock. */
    @Column(name = "is_service", nullable = false)
    private boolean service = false;

    /** Alícuota de IVA (21 / 10.5 / 0). La usa el módulo fiscal para Factura A/B (Fase 3). */
    @Column(name = "iva_rate", nullable = false)
    private BigDecimal ivaRate = new BigDecimal("21.00");

    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
