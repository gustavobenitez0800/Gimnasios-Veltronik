package com.veltronik.v2.fiscal.entities;

/**
 * Tipo de comprobante con su <b>código oficial de ARCA</b> (el que viaja a WSFEv1 en
 * {@code CbteTipo}). Guardamos el enum por nombre y mandamos {@link #getArcaCode()} a la API.
 */
public enum FiscalVoucherType {
    FACTURA_A(1),
    FACTURA_B(6),
    FACTURA_C(11),
    NOTA_CREDITO_A(3),
    NOTA_CREDITO_B(8),
    NOTA_CREDITO_C(13);

    private final int arcaCode;

    FiscalVoucherType(int arcaCode) {
        this.arcaCode = arcaCode;
    }

    /** Código de comprobante que exige el web service de ARCA (CbteTipo). */
    public int getArcaCode() {
        return arcaCode;
    }
}
