package com.veltronik.v2.fiscal.integration;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Datos de un comprobante a autorizar (entrada de {@code FECAESolicitar}). Value object: el
 * orquestador lo arma; el cliente ARCA solo lo serializa al SOAP.
 */
public record CaeRequest(
        int pointOfSale,
        int voucherTypeCode,      // CbteTipo (1=A, 6=B, 11=C)
        long number,              // CbteDesde = CbteHasta
        LocalDate date,
        int concepto,             // 1=productos
        int docTipo,              // 80=CUIT, 96=DNI, 99=consumidor final
        long docNro,
        BigDecimal netAmount,     // ImpNeto
        BigDecimal ivaAmount,     // ImpIVA (0 en Factura C)
        BigDecimal totalAmount,   // ImpTotal
        int condicionIvaReceptorId // 5=Consumidor Final
) {}
