package com.veltronik.v2.kiosk.entities;

/**
 * Estado de una venta ({@link KioskSale}).
 *
 * <p>Una venta nace {@code COMPLETED} (el cobro es instantáneo, no hay estado pendiente como
 * en las señas de canchas). Anularla genera movimientos {@code RETURN} que devuelven el stock;
 * la venta nunca se borra (append-only / trazabilidad).</p>
 */
public enum KioskSaleStatus {
    /** Venta cerrada y cobrada. */
    COMPLETED,
    /** Venta anulada: el stock se devolvió con movimientos RETURN. */
    VOIDED
}
