package com.veltronik.v2.core.controllers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * El endpoint de config pública es la fuente de verdad en RUNTIME de la clave pública de MP:
 * lo que permite que el modal de pago funcione aunque el build del cliente no la tenga.
 */
class PublicConfigControllerTest {

    @Test
    @DisplayName("devuelve la clave pública de MP configurada en el backend")
    void returnsConfiguredPublicKey() {
        var controller = new PublicConfigController("APP_USR-test-key", new BigDecimal("80000"));

        ResponseEntity<Map<String, Object>> res = controller.paymentConfig();

        assertEquals(200, res.getStatusCode().value());
        assertEquals("APP_USR-test-key", res.getBody().get("mpPublicKey"));
        assertEquals(new BigDecimal("80000"), res.getBody().get("monthlyPrice"));
        assertEquals("ARS", res.getBody().get("currency"));
    }

    @Test
    @DisplayName("clave ausente → string vacío (el frontend cae al fallback de build), nunca null")
    void missingKeyReturnsEmptyString() {
        var controller = new PublicConfigController("", new BigDecimal("80000"));

        ResponseEntity<Map<String, Object>> res = controller.paymentConfig();

        assertEquals("", res.getBody().get("mpPublicKey"));
    }
}
