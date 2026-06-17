package com.veltronik.v2.kiosk.entities;

/**
 * Tipo de movimiento del libro mayor de inventario ({@link KioskStockMovement}).
 *
 * <p>El stock real de un producto es la suma firmada de sus movimientos; nunca se edita
 * un movimiento (es append-only): una corrección es OTRO movimiento. Esto da trazabilidad
 * total de mermas, ajustes y reposiciones.</p>
 */
public enum KioskStockMovementType {
    /** Salida por venta (cantidad negativa). La genera el motor de ventas. */
    SALE,
    /** Entrada por compra a proveedor (cantidad positiva). Fase 2. */
    PURCHASE,
    /** Ajuste manual de inventario (recuento físico): puede ser + o -. */
    ADJUSTMENT,
    /** Devolución: reingreso de stock al anular una venta (cantidad positiva). */
    RETURN,
    /** Merma / rotura / vencimiento (cantidad negativa). */
    LOSS
}
