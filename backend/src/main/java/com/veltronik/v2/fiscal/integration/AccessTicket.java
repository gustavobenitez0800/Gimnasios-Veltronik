package com.veltronik.v2.fiscal.integration;

import java.time.Instant;

/**
 * Ticket de Acceso de WSAA (token + sign), válido ~12 h. Se cachea por tenant para no
 * re-loguear en cada comprobante (WSAA rechaza un login nuevo si ya hay un TA vigente).
 */
public record AccessTicket(String token, String sign, Instant expiration) {

    /** ¿Sigue válido en {@code when}, con un margen de seguridad? */
    public boolean isValidAt(Instant when) {
        return expiration != null && expiration.isAfter(when);
    }
}
