package com.veltronik.v2.core.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * La URL a la que Mercado Pago devuelve al cliente después de pagar.
 *
 * <p>Se testea porque ya se rompió una vez: el back_url se armaba como
 * {@code frontendUrl + "/payment-callback"}, SIN el {@code #} que necesita el HashRouter del
 * frontend. El cliente pagaba, MP lo devolvía a una URL que la app no resuelve, nunca veía la
 * pantalla de "pago confirmado" y volvía a intentar el pago creyendo que había fallado.</p>
 */
class BillingPropertiesTest {

    private static BillingProperties conUrl(String url) {
        return new BillingProperties(new BigDecimal("80000"), 14, url);
    }

    @Test
    @DisplayName("la vuelta de MP incluye el # del HashRouter")
    void callbackUrlUsesHashRoute() {
        assertEquals("https://app.veltronik.test/#/payment-callback",
                conUrl("https://app.veltronik.test").paymentCallbackUrl());
    }

    @Test
    @DisplayName("una barra de más al final no duplica la barra de la ruta")
    void trailingSlashIsNormalized() {
        assertEquals("https://app.veltronik.test/#/payment-callback",
                conUrl("https://app.veltronik.test/").paymentCallbackUrl());
        assertEquals("https://app.veltronik.test/#/payment-callback",
                conUrl("https://app.veltronik.test///").paymentCallbackUrl());
    }

    @Test
    @DisplayName("el precio se lee de un solo lugar")
    void priceIsExposed() {
        assertEquals(new BigDecimal("80000"), conUrl("https://x.test").getMonthlyPrice());
    }
}
