package com.veltronik.v2.kiosk.entities;

/**
 * Tipo de movimiento de la cuenta corriente ({@link KioskAccountMovement}). Append-only: el saldo
 * del cliente es la suma firmada (DEBT suma, PAYMENT resta); una corrección es otro movimiento.
 */
public enum KioskAccountMovementType {
    /** Compró fiado: sube la deuda. */
    DEBT,
    /** Pagó su cuenta: baja la deuda. */
    PAYMENT
}
