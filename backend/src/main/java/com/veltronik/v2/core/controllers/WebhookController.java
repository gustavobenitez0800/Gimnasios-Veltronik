package com.veltronik.v2.core.controllers;

import com.mercadopago.client.payment.PaymentClient;
import com.mercadopago.resources.payment.Payment;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantPayment;
import com.veltronik.v2.core.repositories.TenantPaymentRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/webhooks/mercadopago")
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private final TenantRepository tenantRepository;
    private final TenantPaymentRepository paymentRepository;

    @Value("${mercadopago.webhook.secret}")
    private String webhookSecret;

    /**
     * Endpoint público para Webhooks. NO requiere JWT.
     * Seguridad: Valida firma HMAC-SHA256 de MercadoPago.
     * Robustez: Idempotencia estricta para evitar cobros duplicados.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<String> handleWebhook(
            @RequestBody String rawBody,
            @RequestHeader(value = "x-signature", required = false) String xSignature,
            @RequestHeader(value = "x-request-id", required = false) String xRequestId,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String id,
            @RequestParam(name = "data.id", required = false) String dataIdParam) {

        String extractedId = dataIdParam != null ? dataIdParam : id;

        // Parsear el body como Map para procesar
        Map<String, Object> payload = null;
        try {
            com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();
            payload = objectMapper.readValue(rawBody, Map.class);
            
            // Si el ID no viene en la URL (como en el Simulador de MP), lo extraemos del body
            if (extractedId == null) {
                if (payload.containsKey("data") && payload.get("data") instanceof Map) {
                    Object dataIdObj = ((Map<?, ?>) payload.get("data")).get("id");
                    if (dataIdObj != null) extractedId = dataIdObj.toString();
                } else if (payload.containsKey("id")) {
                    extractedId = payload.get("id").toString();
                }
            }
        } catch (Exception e) {
            log.warn("Error al parsear el body del webhook: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }

        // Validar firma de MercadoPago (seguridad crítica)
        if (xSignature != null && !isValidSignature(xSignature, xRequestId, extractedId, rawBody)) {
            log.warn("Webhook rechazado: firma inválida. x-request-id={}", xRequestId);
            return ResponseEntity.status(401).body("Firma inválida");
        }

        log.info("Webhook recibido de Mercado Pago: topic={}, id={}", topic, extractedId);

        if (payload != null && ("payment".equals(topic) || "payment".equals(payload.get("type")))) {
            String paymentIdStr = extractedId;

            if (paymentIdStr != null && paymentRepository.existsByMpPaymentId(paymentIdStr)) {
                log.info("Pago {} ya procesado anteriormente (Idempotencia). Ignorando.", paymentIdStr);
                return ResponseEntity.ok("OK");
            }

                log.info("Procesando nuevo pago de Mercado Pago: {}", paymentIdStr);
                try {
                    Long paymentId = Long.parseLong(paymentIdStr);
                    PaymentClient client = new PaymentClient();
                    Payment payment = client.get(paymentId);

                    if ("approved".equalsIgnoreCase(payment.getStatus())) {
                        String externalReference = payment.getExternalReference();
                        if (externalReference == null || externalReference.isEmpty()) {
                            log.warn("El pago {} no tiene external_reference. Imposible asociarlo a un Tenant.", paymentId);
                            return ResponseEntity.ok("OK");
                        }

                        UUID tenantId;
                        try {
                            tenantId = UUID.fromString(externalReference);
                        } catch (IllegalArgumentException e) {
                            log.warn("El external_reference {} no es un UUID válido.", externalReference);
                            return ResponseEntity.ok("OK");
                        }

                        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
                        if (tenant == null) {
                            log.warn("No se encontró el Tenant con ID {} referenciado por el pago {}.", tenantId, paymentId);
                            return ResponseEntity.ok("OK");
                        }

                        // Registrar el pago
                        TenantPayment tenantPayment = new TenantPayment();
                        tenantPayment.setTenant(tenant);
                        tenantPayment.setMpPaymentId(paymentIdStr);
                        tenantPayment.setAmount(payment.getTransactionAmount());
                        tenantPayment.setStatus("APPROVED");
                        tenantPayment.setPaymentDate(LocalDateTime.now());
                        paymentRepository.save(tenantPayment);

                        // Extender el acceso 30 días desde hoy o desde el último vencimiento
                        LocalDateTime currentEnd = tenant.getTrialEndsAt();
                        if (currentEnd == null || currentEnd.isBefore(LocalDateTime.now())) {
                            tenant.setTrialEndsAt(LocalDateTime.now().plusDays(30));
                        } else {
                            tenant.setTrialEndsAt(currentEnd.plusDays(30));
                        }
                        tenant.setActive(true);
                        tenantRepository.save(tenant);

                        log.info("Pago exitoso {} asociado al Tenant {}. Acceso extendido hasta {}",
                                paymentId, tenantId, tenant.getTrialEndsAt());
                    } else {
                        log.info("El pago {} tiene estado {}. No se aplica extensión.", paymentId, payment.getStatus());
                    }

                } catch (Exception e) {
                    log.error("Error al procesar el pago de Mercado Pago: {}", e.getMessage(), e);
                    // Retornar 500 para que MP reintente automáticamente
                    return ResponseEntity.internalServerError().build();
                }
            }
        } catch (Exception e) {
            log.error("Error al parsear el body del webhook: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }

        return ResponseEntity.ok("OK");
    }

    /**
     * Valida la firma HMAC-SHA256 enviada por MercadoPago en el header x-signature.
     * Documentación: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
     */
    private boolean isValidSignature(String xSignature, String xRequestId, String dataId, String body) {
        try {
            // Extraer ts y v1 del header x-signature (formato: ts=xxx,v1=xxx)
            String ts = null;
            String v1 = null;
            for (String part : xSignature.split(",")) {
                String[] kv = part.trim().split("=", 2);
                if (kv.length == 2) {
                    if ("ts".equals(kv[0])) ts = kv[1];
                    if ("v1".equals(kv[0])) v1 = kv[1];
                }
            }
            if (ts == null || v1 == null) return false;

            // Construir el manifest según documentación de MP
            String manifest = "id:" + (dataId != null ? dataId : "") + ";request-id:" +
                    (xRequestId != null ? xRequestId : "") + ";ts:" + ts + ";";

            // Calcular HMAC-SHA256
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(
                    webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hash = mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8));
            String computed = HexFormat.of().formatHex(hash);

            return computed.equals(v1);
        } catch (Exception e) {
            log.error("Error validando firma del webhook: {}", e.getMessage());
            return false;
        }
    }
}
