package com.veltronik.v2.kiosk.entities;

/**
 * Medio de pago de un {@link KioskSalePayment}. Una venta puede combinar varios (pago mixto).
 *
 * <p>El label legible vive en el front; acá guardamos el código. {@code CUENTA_CORRIENTE}
 * (fiado) se agrega en la Fase 2 junto con el cliente y su cuenta corriente.</p>
 */
public enum KioskPaymentMethod {
    /** Efectivo. Es el único que entra al arqueo de caja. */
    CASH,
    /** Tarjeta (débito/crédito) por PostNet. */
    CARD,
    /** Transferencia bancaria / alias. */
    TRANSFER,
    /** Mercado Pago (QR o link). En Fase 1 es solo etiqueta; el QR dinámico llega después. */
    MP
}
