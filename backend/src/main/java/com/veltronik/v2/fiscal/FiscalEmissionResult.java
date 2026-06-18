package com.veltronik.v2.fiscal;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Resultado de una emisión. Value object devuelto a la vertical: trae el estado del comprobante
 * (AUTHORIZED con CAE+QR, REJECTED con motivo, o CONTINGENCY a la espera del cron).
 */
public record FiscalEmissionResult(
        UUID voucherId,
        String status,
        String voucherType,
        Long number,
        String cae,
        LocalDate caeExpiration,
        String qrUrl,
        String observations
) {}
