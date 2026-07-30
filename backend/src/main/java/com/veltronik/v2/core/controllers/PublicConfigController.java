package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.config.BillingProperties;
import com.veltronik.v2.core.config.MercadoPagoProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Configuración PÚBLICA del cliente, servida en RUNTIME.
 *
 * <p><b>Por qué existe (decisión de arquitectura):</b> antes la clave pública de Mercado
 * Pago se "horneaba" en el bundle de cada cliente en build-time (VITE_MP_PUBLIC_KEY, vía
 * GitHub Secret). Si ese secret faltaba o estaba mal cuando se generó el instalador, el
 * modal de pago (Card Payment Brick) quedaba roto para TODOS los clientes de TODAS las
 * verticales (gym, kiosco, canchas…) y no había forma de arreglarlo sin publicar un release
 * nuevo y esperar el auto-update.</p>
 *
 * <p>La clave pública de MP <b>no es secreta</b> (viaja embebida en el cliente igual), así
 * que la fuente única de verdad pasa a ser una variable de entorno del backend
 * ({@code MP_PUBLIC_KEY}). El frontend la resuelve en runtime contra este endpoint y usa el
 * valor de build solo como respaldo. Resultado: un build con la clave faltante/vieja se
 * autocorrige, y futuras integraciones (otros medios de pago, flags) entran por el mismo
 * canal — sin un secret de build por integración.</p>
 *
 * <p>Va bajo {@code /api/public/**}: {@code permitAll} y excluido del KillSwitch, así
 * responde en cualquier estado (sin login, en onboarding, o con el tenant bloqueado pagando).</p>
 */
@RestController
@RequestMapping("/api/public")
public class PublicConfigController {

    private final MercadoPagoProperties mercadoPago;
    private final BillingProperties billing;

    public PublicConfigController(MercadoPagoProperties mercadoPago, BillingProperties billing) {
        this.mercadoPago = mercadoPago;
        this.billing = billing;
    }

    @GetMapping("/payment-config")
    public ResponseEntity<Map<String, Object>> paymentConfig() {
        String publicKey = mercadoPago.getPublicKey();
        return ResponseEntity.ok(Map.of(
                "mpPublicKey", publicKey != null ? publicKey : "",
                "currency", "ARS",
                "monthlyPrice", billing.getMonthlyPrice()
        ));
    }
}
