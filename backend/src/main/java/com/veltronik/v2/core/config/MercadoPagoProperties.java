package com.veltronik.v2.core.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Las credenciales y flags de Mercado Pago, en UN solo lugar.
 *
 * <p>El access token se leía en dos clases distintas ({@code MercadoPagoConfiguration}, que se lo
 * pasa al SDK, y {@code MercadoPagoService}, que hace a mano la llamada que el SDK no expone).
 * Ahora las dos piden este bean, así que no hay forma de que una quede mirando una variable de
 * entorno y la otra otra.</p>
 *
 * <p>Los nombres de las propiedades NO se tocaron: son las que Railway ya tiene seteadas
 * (MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET, MP_ENFORCE_SIGNATURE).</p>
 */
@Component
@Getter
public class MercadoPagoProperties {

    /** Token privado. Nunca sale del backend. */
    private final String accessToken;

    /** Clave pública: viaja al navegador (la sirve /api/public/payment-config). NO es secreta. */
    private final String publicKey;

    /** Secreto para validar la firma de los webhooks. */
    private final String webhookSecret;

    /**
     * Válvula de seguridad para el lanzamiento. Si por algún desajuste de formato la firma
     * fallara, poniendo {@code MP_ENFORCE_SIGNATURE=false} se procesan los eventos igual, sin
     * esperar un redeploy. SEGURO POR DEFAULT (true).
     */
    private final boolean enforceSignature;

    public MercadoPagoProperties(
            @Value("${mercadopago.access.token:}") String accessToken,
            @Value("${mercadopago.public.key:}") String publicKey,
            @Value("${mercadopago.webhook.secret:}") String webhookSecret,
            @Value("${mercadopago.webhook.enforce-signature:true}") boolean enforceSignature) {
        this.accessToken = accessToken;
        this.publicKey = publicKey;
        this.webhookSecret = webhookSecret;
        this.enforceSignature = enforceSignature;
    }

    public boolean hasAccessToken() {
        return accessToken != null && !accessToken.isBlank();
    }
}
