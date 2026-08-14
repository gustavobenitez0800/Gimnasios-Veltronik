package com.veltronik.v2.core.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Los datos del cobro, en UN solo lugar.
 *
 * <p>Antes cada clase que necesitaba el precio lo leía por su cuenta con su propio valor por
 * defecto: {@code @Value("${veltronik.billing.monthly-price:80000}")} estaba escrito CUATRO veces
 * (PublicConfigController, BillingService, MercadoPagoService y SubscriptionBillingService) y la
 * URL del frontend DOS. Tocar el precio obligaba a acordarse de los cuatro, y el que se olvidara
 * quedaba cobrando distinto de lo que la app le muestra al cliente. Acá el default vive una vez
 * y los demás piden este bean por constructor.</p>
 *
 * <p>Dato: dos de esas cuatro copias no las encontró ningún grep —estaban escritas con el
 * nombre largo, {@code @org.springframework.beans.factory.annotation.Value}— sino la regla
 * de ArchUnit que prohíbe {@code @Value} en campos. Por eso la regla vale más que la limpieza.</p>
 */
@Component
@Getter
public class BillingProperties {

    /** Precio mensual del sistema (ARS). Tarifa plana para todos los rubros. */
    private final BigDecimal monthlyPrice;

    /** Base pública de la app web: a dónde vuelve el cliente después de pagar. */
    private final String frontendUrl;

    /** Días de prueba de la PRIMERA sucursal (las adicionales pagan de entrada). */
    private final int trialDays;

    public BillingProperties(
            @Value("${veltronik.billing.monthly-price:80000}") BigDecimal monthlyPrice,
            @Value("${veltronik.billing.trial-days:14}") int trialDays,
            // Cadena de respaldo a propósito: `cors.frontend-url` es la variable histórica, pero
            // no está definida en application.properties, así que si nadie la setea caía SIEMPRE
            // en el default del código. FRONTEND_URL sí se usa (CORS), así que sirve de segunda
            // opción antes de recurrir al valor fijo.
            @Value("${cors.frontend-url:${FRONTEND_URL:https://veltronik-v2.vercel.app}}") String frontendUrl) {
        this.monthlyPrice = monthlyPrice;
        this.trialDays = trialDays;
        this.frontendUrl = trimTrailingSlash(frontendUrl);
    }

    /**
     * URL a la que Mercado Pago devuelve al cliente después de pagar.
     *
     * <p><b>El {@code /#/} no es un detalle:</b> la app usa HashRouter, o sea que sus rutas viven
     * después del {@code #}. Sin el numeral, el cliente que pagaba aterrizaba en una URL que la
     * app no resuelve —nunca veía la pantalla de "pago confirmado"— y volvía a intentar el pago
     * creyendo que había fallado. Es el mismo formato que ya usa el mail de recuperar contraseña
     * ({@code AuthService.resetPassword}).</p>
     */
    public String paymentCallbackUrl() {
        return frontendUrl + "/#/payment-callback";
    }

    private static String trimTrailingSlash(String url) {
        if (url == null || url.isBlank()) return "";
        return url.replaceAll("/+$", "");
    }
}
