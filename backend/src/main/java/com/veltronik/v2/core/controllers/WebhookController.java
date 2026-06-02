package com.veltronik.v2.core.controllers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercadopago.client.payment.PaymentClient;
import com.mercadopago.client.preapproval.PreapprovalClient;
import com.mercadopago.resources.payment.Payment;
import com.mercadopago.resources.preapproval.Preapproval;
import com.veltronik.v2.core.services.MercadoPagoService;
import com.veltronik.v2.core.services.SubscriptionBillingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Endpoint público de Webhooks de Mercado Pago (NO requiere JWT).
 *
 * <p><b>Seguridad:</b> si hay un secret configurado, la firma HMAC-SHA256 es
 * OBLIGATORIA (antes se saltaba la validación cuando faltaba el header — un hueco).</p>
 *
 * <p><b>Arquitectura:</b> la llamada HTTP a Mercado Pago (red) se hace acá, FUERA de
 * cualquier transacción. La escritura en BD se delega a {@link SubscriptionBillingService},
 * que abre una transacción corta. Así no se mantiene una conexión de BD abierta durante
 * la llamada remota.</p>
 *
 * <p><b>Eventos:</b> {@code payment} (alta / cobros que traen external_reference),
 * {@code subscription_preapproval} (cambios de estado de la suscripción: alta, pausa,
 * cancelación, reactivación) y {@code subscription_authorized_payment} (la RENOVACIÓN
 * mensual). El cobro recurrente NO trae el external_reference en el {@code payment}, por
 * eso la renovación se resuelve por el authorized_payment → preapproval → external_reference.
 * La idempotencia (por mpPaymentId del pago real) la garantiza el service.</p>
 */
@RestController
@RequestMapping("/api/webhooks/mercadopago")
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final SubscriptionBillingService billingService;
    private final MercadoPagoService mercadoPagoService;

    @Value("${mercadopago.webhook.secret:}")
    private String webhookSecret;

    /**
     * Válvula de seguridad para el lanzamiento. Si por algún desajuste de formato la
     * firma fallara, poniendo {@code mercadopago.webhook.enforce-signature=false} (env var)
     * se procesan los eventos igual, sin esperar un redeploy. SEGURO POR DEFAULT (true);
     * volver a true apenas se valide la firma en producción.
     */
    @Value("${mercadopago.webhook.enforce-signature:true}")
    private boolean enforceSignature;

    @PostMapping
    public ResponseEntity<String> handleWebhook(
            @RequestBody String rawBody,
            @RequestHeader(value = "x-signature", required = false) String xSignature,
            @RequestHeader(value = "x-request-id", required = false) String xRequestId,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String id,
            @RequestParam(name = "data.id", required = false) String dataIdParam) {

        // 1) Parsear el body
        final Map<String, Object> payload;
        try {
            payload = MAPPER.readValue(rawBody, Map.class);
        } catch (Exception e) {
            log.warn("Webhook con body ilegible: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }

        // 2) Resolver el id del recurso (puede venir por query string o dentro del body)
        final String resourceId = firstNonBlank(dataIdParam, id, extractDataId(payload));

        // 3) FIRMA: si hay secret configurado, es OBLIGATORIA y debe ser válida.
        if (webhookSecret != null && !webhookSecret.isBlank()) {
            boolean validSignature = xSignature != null && isValidSignature(xSignature, xRequestId, resourceId, rawBody);
            if (!validSignature) {
                if (enforceSignature) {
                    log.warn("Webhook RECHAZADO: firma ausente o inválida. x-request-id={}", xRequestId);
                    return ResponseEntity.status(401).body("Firma inválida");
                }
                // Válvula de lanzamiento abierta: se procesa igual, dejando rastro para revisar.
                log.warn("Firma inválida pero enforce-signature=false → se procesa igual. x-request-id={}", xRequestId);
            }
        }

        // 4) Tipo de evento (formato nuevo: 'type'; formato viejo: 'topic'; o dentro del body)
        final String eventType = firstNonBlank(type, topic,
                asString(payload.get("type")), asString(payload.get("topic")));
        log.info("Webhook MP: type={}, resourceId={}", eventType, resourceId);

        if (resourceId == null) {
            return ResponseEntity.ok("OK"); // ping / sin recurso asociado
        }

        try {
            switch (eventType == null ? "" : eventType) {
                case "payment" -> processPayment(resourceId);
                case "subscription_preapproval" -> processPreapproval(resourceId);
                case "subscription_authorized_payment" -> processAuthorizedPayment(resourceId);
                default -> log.info("Tipo de evento '{}' no manejado. Ignorado.", eventType);
            }
        } catch (Exception e) {
            // 500 → Mercado Pago reintenta automáticamente la notificación.
            log.error("Error procesando webhook MP (resourceId={}): {}", resourceId, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
        return ResponseEntity.ok("OK");
    }

    /** Procesa un evento de pago. La llamada a MP es de red (fuera de transacción). */
    private void processPayment(String paymentIdStr) throws Exception {
        // Bypass de los pagos de prueba del simulador de Mercado Pago
        if ("123456".equals(paymentIdStr) || "987654321".equals(paymentIdStr)) {
            log.info("Pago de simulador {} detectado. OK sin procesar.", paymentIdStr);
            return;
        }

        Payment payment = new PaymentClient().get(Long.parseLong(paymentIdStr));
        if (!"approved".equalsIgnoreCase(payment.getStatus())) {
            log.info("Pago {} en estado '{}'. No se aplica acceso.", paymentIdStr, payment.getStatus());
            return;
        }

        UUID tenantId = parseTenant(payment.getExternalReference());
        if (tenantId == null) {
            log.warn("Pago {} sin external_reference de tenant válido. Imposible asociar.", paymentIdStr);
            return;
        }

        billingService.applyApprovedPayment(tenantId, paymentIdStr, payment.getTransactionAmount(), null);
    }

    /** Procesa un cambio de estado de la suscripción (preapproval). */
    private void processPreapproval(String preapprovalId) throws Exception {
        Preapproval pre = new PreapprovalClient().get(preapprovalId);
        UUID tenantId = parseTenant(pre.getExternalReference());
        if (tenantId == null) {
            log.warn("Preapproval {} sin external_reference de tenant válido.", preapprovalId);
            return;
        }
        billingService.updatePreapprovalStatus(tenantId, preapprovalId, pre.getStatus());
    }

    /**
     * Procesa la RENOVACIÓN mensual de una suscripción. MP emite {@code subscription_authorized_payment}
     * en cada cobro recurrente; el recurso authorized_payment (consultado por HTTP, el SDK no lo expone)
     * trae el preapproval y el pago real.
     *
     * <p>El tenant se resuelve por el {@code external_reference} del PREAPPROVAL (la fuente de verdad
     * que seteamos al crear la suscripción), NO por el del payment, que en cobros recurrentes viene
     * vacío. La idempotencia la da el id del pago real. Si algo falla acá, el cliente NO queda
     * bloqueado de inmediato (colchón: GRACE_DAYS + trial_ends_at) y queda el Plan B manual
     * {@code scripts/reactivar_tenant.mjs}. Se loguea el payload real para validar el contrato MP
     * contra la 1ª renovación en vivo.</p>
     */
    private void processAuthorizedPayment(String authorizedPaymentId) throws Exception {
        MercadoPagoService.AuthorizedPaymentInfo info = mercadoPagoService.getAuthorizedPayment(authorizedPaymentId);
        if (info == null) {
            log.warn("authorized_payment {} no se pudo obtener de MP (Plan B manual).", authorizedPaymentId);
            return;
        }
        log.info("authorized_payment {} → preapprovalId={}, paymentId={}, status={}, detail={}, amount={}",
                authorizedPaymentId, info.preapprovalId(), info.paymentId(), info.paymentStatus(), info.paymentStatusDetail(), info.amount());

        // Resolvemos el tenant SIEMPRE (sirve tanto para aplicar el cobro como para registrar el rechazo).
        if (info.preapprovalId() == null || info.preapprovalId().isBlank()) {
            log.warn("authorized_payment {} sin preapproval_id. Imposible resolver tenant.", authorizedPaymentId);
            return;
        }
        Preapproval pre = new PreapprovalClient().get(info.preapprovalId());
        UUID tenantId = parseTenant(pre.getExternalReference());
        if (tenantId == null) {
            log.warn("Preapproval {} (de authorized_payment {}) sin external_reference de tenant válido.",
                    info.preapprovalId(), authorizedPaymentId);
            return;
        }

        if ("approved".equalsIgnoreCase(info.paymentStatus())) {
            // Cobro APROBADO → ÚNICO punto que otorga acceso. Idempotente por el id del pago real.
            String mpPaymentId = info.paymentId() != null ? info.paymentId() : authorizedPaymentId;
            billingService.applyApprovedPayment(tenantId, mpPaymentId, info.amount(), info.preapprovalId());
            log.info("COBRO APROBADO aplicado: tenant {} (authorized_payment {}, payment {}).",
                    tenantId, authorizedPaymentId, mpPaymentId);
        } else {
            // Cobro RECHAZADO → registrar el motivo para la UX, NO otorgar acceso.
            billingService.recordRejectedCharge(tenantId, info.preapprovalId(), info.paymentStatusDetail());
            log.info("COBRO RECHAZADO: tenant {} (status={}, detail={}).",
                    tenantId, info.paymentStatus(), info.paymentStatusDetail());
        }
    }

    // ─────────────────────────── helpers ───────────────────────────

    private UUID parseTenant(String externalReference) {
        if (externalReference == null || externalReference.isBlank()) return null;
        try {
            return UUID.fromString(externalReference);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String extractDataId(Map<String, Object> payload) {
        Object data = payload.get("data");
        if (data instanceof Map<?, ?> m && m.get("id") != null) {
            return m.get("id").toString();
        }
        return asString(payload.get("id"));
    }

    private String asString(Object o) {
        return o != null ? o.toString() : null;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    /**
     * Valida la firma HMAC-SHA256 del header x-signature (formato: ts=...,v1=...).
     * Doc: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
     */
    private boolean isValidSignature(String xSignature, String xRequestId, String dataId, String body) {
        try {
            String ts = null, v1 = null;
            for (String part : xSignature.split(",")) {
                String[] kv = part.trim().split("=", 2);
                if (kv.length == 2) {
                    if ("ts".equals(kv[0])) ts = kv[1];
                    if ("v1".equals(kv[0])) v1 = kv[1];
                }
            }
            if (ts == null || v1 == null) return false;

            String manifest = "id:" + (dataId != null ? dataId : "") + ";request-id:" +
                    (xRequestId != null ? xRequestId : "") + ";ts:" + ts + ";";

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).equals(v1);
        } catch (Exception e) {
            log.error("Error validando firma del webhook: {}", e.getMessage());
            return false;
        }
    }
}
