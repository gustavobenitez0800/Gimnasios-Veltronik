package com.veltronik.v2.fiscal.entities;

/**
 * Condición del EMISOR frente al IVA. Determina qué tipo de comprobante puede emitir:
 * el monotributista emite Factura C; el responsable inscripto, A o B según el receptor.
 */
public enum FiscalCondicionIva {
    /** Monotributo: el caso típico de un kiosco. Emite Factura C (sin discriminar IVA). */
    MONOTRIBUTO,
    /** Responsable Inscripto: emite Factura A (a otro RI) o B (a consumidor final). */
    RESPONSABLE_INSCRIPTO,
    /** Exento. */
    EXENTO
}
