package com.veltronik.v2.kiosk.entities;

/**
 * Estado de una sesión de caja ({@link KioskCashSession}).
 *
 * <p>Invariante dura del vertical: a lo sumo UNA sesión {@code OPEN} por tenant a la vez
 * (garantizada por el índice único parcial {@code ux_kiosk_cash_session_open}). Toda venta
 * se ata a la caja abierta; sin caja abierta, el POS no vende.</p>
 */
public enum KioskCashSessionStatus {
    /** Caja abierta: acepta ventas. */
    OPEN,
    /** Caja cerrada y arqueada (con diferencia calculada). Inmutable. */
    CLOSED
}
