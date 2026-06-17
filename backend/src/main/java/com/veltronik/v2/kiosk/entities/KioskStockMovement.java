package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Asiento del <b>libro mayor de inventario</b> (append-only).
 *
 * <p>El stock real de un producto es la suma firmada de sus movimientos. Nunca se edita ni se
 * borra un movimiento: una corrección es OTRO movimiento. Esto da trazabilidad total de ventas,
 * compras, ajustes y mermas — el dueño puede auditar por qué su stock es el que es.</p>
 */
@Entity
@Table(name = "kiosk_stock_movement")
@Getter
@Setter
public class KioskStockMovement extends TenantAwareEntity {

    /** EAGER: el historial siempre muestra el producto y la app corre con open-in-view=false;
     *  las listas usan JOIN FETCH para evitar N+1. */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private KioskProduct product;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private KioskStockMovementType type;

    /** Cantidad firmada: venta/merma negativas, compra/devolución positivas. */
    @Column(nullable = false)
    private BigDecimal quantity;

    @Column(length = 255)
    private String reason;

    /** Venta que originó el movimiento (si es de tipo SALE/RETURN). Plano: no acopla agregados. */
    @Column(name = "sale_id")
    private UUID saleId;

    @Column(name = "created_by")
    private UUID createdBy;
}
