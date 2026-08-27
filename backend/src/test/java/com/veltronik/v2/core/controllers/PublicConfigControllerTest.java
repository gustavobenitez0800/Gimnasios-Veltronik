package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.config.BillingProperties;
import com.veltronik.v2.core.config.MercadoPagoProperties;
import com.veltronik.v2.core.config.PlanCatalog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El endpoint de config pública es la fuente de verdad en RUNTIME de la clave pública de MP:
 * lo que permite que el modal de pago funcione aunque el build del cliente no la tenga.
 * Desde la división de planes también publica el catálogo de lo que se puede contratar.
 */
class PublicConfigControllerTest {

    private static MercadoPagoProperties mpProps(String publicKey) {
        return new MercadoPagoProperties("token-de-prueba", publicKey, "secreto", true);
    }

    private static BillingProperties billingProps() {
        return new BillingProperties(new BigDecimal("45000"), 14, "https://app.veltronik.test");
    }

    private static PlanCatalog catalog(boolean premiumAvailable) {
        return new PlanCatalog(billingProps(), new BigDecimal("80000"), premiumAvailable);
    }

    private static PublicConfigController controller(String publicKey, boolean premiumAvailable) {
        return new PublicConfigController(mpProps(publicKey), billingProps(), catalog(premiumAvailable));
    }

    @Test
    @DisplayName("devuelve la clave pública de MP configurada en el backend")
    void returnsConfiguredPublicKey() {
        ResponseEntity<Map<String, Object>> res = controller("APP_USR-test-key", false).paymentConfig();

        assertEquals(200, res.getStatusCode().value());
        assertEquals("APP_USR-test-key", res.getBody().get("mpPublicKey"));
        assertEquals(new BigDecimal("45000"), res.getBody().get("monthlyPrice"));
        assertEquals("ARS", res.getBody().get("currency"));
    }

    @Test
    @DisplayName("clave ausente → string vacío (el frontend cae al fallback de build), nunca null")
    void missingKeyReturnsEmptyString() {
        ResponseEntity<Map<String, Object>> res = controller("", false).paymentConfig();

        assertEquals("", res.getBody().get("mpPublicKey"));
    }

    /**
     * El corazón de la división de planes: un plan en construcción NO tiene que poder
     * contratarse. Si se filtra por acá, cualquier pantalla lo ofrece y alguien paga por algo
     * que no existe.
     */
    @Nested
    @DisplayName("catálogo de planes")
    class Planes {

        @Test
        @DisplayName("con el premium apagado solo se ofrece el básico")
        void premiumApagadoNoSale() {
            List<Map<String, Object>> planes = controller("k", false).plans().getBody();

            assertEquals(1, planes.size(), "un plan en construcción no se ofrece");
            assertEquals("BASICO", planes.get(0).get("code"));
            assertEquals(new BigDecimal("45000"), planes.get(0).get("price"));
        }

        @Test
        @DisplayName("ninguna respuesta menciona el premium mientras está apagado")
        void premiumApagadoNiSeNombra() {
            String json = controller("k", false).plans().getBody().toString();

            assertFalse(json.contains("PREMIUM"), "el plan oculto no debe viajar al cliente");
            assertFalse(json.contains("80000"), "ni su precio");
        }

        @Test
        @DisplayName("al prender la variable, el premium aparece sin tocar código")
        void premiumPrendidoAparece() {
            List<Map<String, Object>> planes = controller("k", true).plans().getBody();

            assertEquals(2, planes.size());
            assertTrue(planes.stream().anyMatch(p -> "PREMIUM".equals(p.get("code"))));
        }

        @Test
        @DisplayName("cada plan viaja con lo que el cliente necesita para decidir")
        void cadaPlanTraeSusDatos() {
            Map<String, Object> basico = controller("k", false).plans().getBody().get(0);

            assertTrue(basico.containsKey("name"));
            assertTrue(basico.containsKey("tagline"));
            assertTrue(basico.containsKey("features"));
            assertFalse(((List<?>) basico.get("features")).isEmpty());
        }
    }
}
