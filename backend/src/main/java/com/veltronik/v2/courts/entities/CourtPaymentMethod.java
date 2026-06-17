package com.veltronik.v2.courts.entities;

/**
 * Cómo entró la plata de un turno (seña y/o saldo). Es la realidad de una cancha:
 * la seña suele venir por transferencia/MP y el saldo se cobra en efectivo al llegar.
 *
 * <p>El label legible vive en el front; acá guardamos el código.</p>
 */
public enum CourtPaymentMethod {
    CASH,       // efectivo en el mostrador
    TRANSFER,   // transferencia bancaria / alias
    MP          // Mercado Pago (link, QR o app)
}
