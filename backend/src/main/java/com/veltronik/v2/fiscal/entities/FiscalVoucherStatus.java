package com.veltronik.v2.fiscal.entities;

/**
 * Estado de un comprobante.
 *
 * <pre>
 * PENDING ──FECAESolicitar OK──► AUTHORIZED (tiene CAE + QR)
 *    │
 *    ├──error de red / ARCA caído──► CONTINGENCY (el cron reintenta hasta obtener el CAE)
 *    └──rechazo de ARCA────────────► REJECTED   (queda el motivo en arca_observations)
 * </pre>
 *
 * <p>Clave del diseño: una venta NUNCA espera a ARCA. El comprobante nace PENDING y obtiene su
 * CAE de forma asíncrona; si ARCA falla, queda en CONTINGENCY y el mostrador sigue vendiendo.</p>
 */
public enum FiscalVoucherStatus {
    /** Creado, esperando solicitar el CAE. */
    PENDING,
    /** Autorizado por ARCA: tiene CAE, vencimiento y QR. */
    AUTHORIZED,
    /** Rechazado por ARCA (datos inválidos). Ver {@code arcaObservations}. */
    REJECTED,
    /** ARCA no respondió (red/caído). El cron de contingencia reintenta. */
    CONTINGENCY
}
