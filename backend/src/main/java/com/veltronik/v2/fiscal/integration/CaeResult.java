package com.veltronik.v2.fiscal.integration;

import java.time.LocalDate;

/**
 * Resultado de {@code FECAESolicitar}. {@code resultado} = "A" (aprobado) / "R" (rechazado).
 * En "A" trae CAE + vencimiento; en "R" trae el motivo en {@code observations}.
 */
public record CaeResult(
        String resultado,
        String cae,
        LocalDate caeExpiration,
        long cbteNumber,
        String observations
) {
    public boolean approved() {
        return "A".equalsIgnoreCase(resultado);
    }
}
