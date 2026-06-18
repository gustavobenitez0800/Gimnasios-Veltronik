package com.veltronik.v2.fiscal;

import java.math.BigDecimal;

/** Renglón del comprobante (detalle para el PDF/ticket). Parte del contrato público del módulo fiscal. */
public record FiscalLineItem(
        String description,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal ivaRate
) {}
