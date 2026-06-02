package com.veltronik.v2.core.services;

import com.mercadopago.client.preapproval.PreapprovalClient;
import com.mercadopago.client.preapproval.PreapprovalCreateRequest;
import com.mercadopago.client.preapproval.PreApprovalAutoRecurringCreateRequest;
import com.mercadopago.resources.preapproval.Preapproval;
import com.veltronik.v2.core.entities.Tenant;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Servicio de integración con Mercado Pago para crear links de suscripción.
 *
 * NOTA IMPORTANTE: MercadoPagoConfig.setAccessToken() se inicializa UNA SOLA
 * VEZ en
 * {@link com.veltronik.v2.core.config.MercadoPagoConfiguration}
 * via @PostConstruct.
 * No repetir aquí para evitar race conditions.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MercadoPagoService {

    @Value("${veltronik.billing.monthly-price:80000}")
    private BigDecimal subscriptionPrice;

    @Value("${cors.frontend-url:https://veltronik.com}")
    private String frontendUrl;

    /** Token de MP. Lo usa la llamada HTTP a authorized_payments (recurso que el SDK no expone). */
    @Value("${mercadopago.access.token:}")
    private String accessToken;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String MP_API = "https://api.mercadopago.com";

    /**
     * Crea un enlace de suscripción (Preapproval) mensual para la sucursal.
     * Cero Margen de Error: Usamos el ID del Tenant como external_reference para
     * no perder jamás la trazabilidad del pago.
     */
    public String createSubscriptionForTenant(Tenant tenant, String payerEmail) {
        try {
            PreapprovalClient client = new PreapprovalClient();

            // Configuración de cobro automático mensual
            PreApprovalAutoRecurringCreateRequest autoRecurring = PreApprovalAutoRecurringCreateRequest.builder()
                    .frequency(1)
                    .frequencyType("months")
                    .transactionAmount(subscriptionPrice)
                    .currencyId("ARS")
                    .build();

            // NO se setea .status("authorized"): eso exige un card_token (tarjeta ya
            // capturada) y MP devuelve 500 si se autoriza sin medio de pago. Generamos
            // el link en estado pendiente; el cliente carga la tarjeta en el checkout de MP.
            PreapprovalCreateRequest request = PreapprovalCreateRequest.builder()
                    .reason("Suscripción Veltronik V2 - " + tenant.getName())
                    .externalReference(tenant.getId().toString())
                    .payerEmail(payerEmail)
                    .autoRecurring(autoRecurring)
                    .backUrl(frontendUrl + "/payment-callback")
                    .build();

            Preapproval preapproval = client.create(request);

            log.info("Suscripción generada en Mercado Pago para Tenant '{}' ({}): preapprovalId={}",
                    tenant.getName(), tenant.getId(), preapproval.getId());
            return preapproval.getInitPoint();

        } catch (com.mercadopago.exceptions.MPApiException apiEx) {
            // El detalle real de MP NO está en getMessage(), sino en la respuesta de la API.
            String detail = apiEx.getApiResponse() != null ? apiEx.getApiResponse().getContent() : "(sin cuerpo)";
            log.error("Mercado Pago RECHAZÓ la suscripción del Tenant '{}'. HTTP {} — Detalle: {}",
                    tenant.getId(), apiEx.getStatusCode(), detail);
            throw new RuntimeException("Mercado Pago rechazó la solicitud (HTTP " + apiEx.getStatusCode() + "): " + detail, apiEx);
        } catch (Exception e) {
            log.error("Error crítico al crear suscripción en Mercado Pago para Tenant '{}'", tenant.getId(), e);
            throw new RuntimeException("Fallo en la pasarela de pagos al generar suscripción.", e);
        }
    }

    /**
     * Crea una suscripción cobrando una TARJETA TOKENIZADA, SIN redirección ni login de MP.
     *
     * <p>El cliente carga la tarjeta en el Card Payment Brick (front), MP la tokeniza del lado
     * del cliente (nunca vemos el número) y acá creamos el preapproval con
     * {@code card_token_id} + {@code status="authorized"}: MP valida la tarjeta y arma el cobro
     * mensual automático. Resuelve el "Tu e-mail no coincide": ya no hay login de MP, la tarjeta
     * se cobra directo. El 1er cobro real ocurre ~1h después (llega por webhook).</p>
     */
    public CardSubscriptionResult createCardSubscription(Tenant tenant, String payerEmail, String cardToken) {
        // Por HTTP directo: el SDK 2.9.2 NO expone card_token_id en PreapprovalCreateRequest
        // (verificado: el builder no tiene .cardTokenId()). Mismo patrón que getAuthorizedPayment().
        try {
            java.util.Map<String, Object> autoRecurring = new java.util.LinkedHashMap<>();
            autoRecurring.put("frequency", 1);
            autoRecurring.put("frequency_type", "months");
            autoRecurring.put("transaction_amount", subscriptionPrice);
            autoRecurring.put("currency_id", "ARS");

            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("reason", "Suscripción Veltronik V2 - " + tenant.getName());
            payload.put("external_reference", tenant.getId().toString());
            payload.put("payer_email", payerEmail);
            payload.put("card_token_id", cardToken);   // tarjeta ya tokenizada por el Brick
            payload.put("status", "authorized");        // cobro directo, sin checkout/redirección
            payload.put("auto_recurring", autoRecurring);
            payload.put("back_url", frontendUrl + "/payment-callback");

            String json = MAPPER.writeValueAsString(payload);

            HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(MP_API + "/preapproval"))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(20))
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
                log.error("Mercado Pago RECHAZÓ el cobro con tarjeta del Tenant '{}'. HTTP {} — Detalle: {}",
                        tenant.getId(), resp.statusCode(), resp.body());
                throw new RuntimeException("Mercado Pago rechazó el pago (HTTP " + resp.statusCode() + "): " + resp.body());
            }

            JsonNode node = MAPPER.readTree(resp.body());
            String id = text(node, "id");
            String status = text(node, "status");
            log.info("Suscripción con tarjeta creada para Tenant '{}' ({}): preapprovalId={}, status={}",
                    tenant.getName(), tenant.getId(), id, status);
            return new CardSubscriptionResult(id, status);

        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            log.error("Error crítico al cobrar con tarjeta para Tenant '{}'", tenant.getId(), e);
            throw new RuntimeException("Fallo al procesar el pago con tarjeta.", e);
        }
    }

    /**
     * Consulta un "authorized payment" (un cobro recurrente de suscripción) por HTTP directo.
     *
     * <p>El SDK de Mercado Pago 2.9.2 NO expone cliente para este recurso, por eso se llama a
     * la API REST a mano. Se usa para procesar las RENOVACIONES mensuales: el evento
     * {@code subscription_authorized_payment} trae el id de este recurso. De acá salen el
     * {@code preapproval_id} (para resolver el tenant) y el pago real (id, estado, monto).</p>
     *
     * @return los datos del cobro, o {@code null} si no se pudo obtener (se loguea el detalle).
     */
    public AuthorizedPaymentInfo getAuthorizedPayment(String authorizedPaymentId) {
        if (accessToken == null || accessToken.isBlank()) {
            log.error("MP access token no configurado: imposible consultar authorized_payment {}.", authorizedPaymentId);
            return null;
        }
        try {
            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(MP_API + "/authorized_payments/" + authorizedPaymentId))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.error("MP /authorized_payments/{} devolvió HTTP {} — body: {}",
                        authorizedPaymentId, resp.statusCode(), resp.body());
                return null;
            }
            JsonNode node = MAPPER.readTree(resp.body());
            JsonNode paymentNode = node.get("payment");

            String preapprovalId = text(node, "preapproval_id");
            String paymentId = paymentNode != null ? text(paymentNode, "id") : text(node, "payment_id");
            String paymentStatus = paymentNode != null ? text(paymentNode, "status") : text(node, "status");
            String paymentStatusDetail = paymentNode != null ? text(paymentNode, "status_detail") : text(node, "status_detail");

            JsonNode amtNode = (paymentNode != null && paymentNode.get("transaction_amount") != null)
                    ? paymentNode.get("transaction_amount") : node.get("transaction_amount");
            BigDecimal amount = (amtNode != null && amtNode.isNumber()) ? amtNode.decimalValue() : null;

            return new AuthorizedPaymentInfo(preapprovalId, paymentId, paymentStatus, paymentStatusDetail, amount, resp.body());
        } catch (Exception e) {
            log.error("Error consultando authorized_payment {} en MP: {}", authorizedPaymentId, e.getMessage(), e);
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return (v != null && !v.isNull()) ? v.asText() : null;
    }

    /** Datos mínimos de un cobro recurrente (authorized_payment) que necesita el webhook. */
    public record AuthorizedPaymentInfo(
            String preapprovalId, String paymentId, String paymentStatus, String paymentStatusDetail,
            BigDecimal amount, String rawJson) {}

    /** Resultado mínimo de crear una suscripción con tarjeta (preapproval). */
    public record CardSubscriptionResult(String preapprovalId, String status) {}
}
