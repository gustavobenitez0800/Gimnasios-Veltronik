package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.services.MercadoPagoService;
import com.veltronik.v2.core.services.SubscriptionBillingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests de la firma HMAC-SHA256 de los webhooks de Mercado Pago (isValidSignature,
 * vía handleWebhook). Con secret configurado, la firma es OBLIGATORIA: header
 * x-signature con formato {@code ts=...,v1=...} y manifest
 * {@code id:<data.id lowercase>;request-id:<x-request-id>;ts:<ts>;}.
 *
 * <p>Se usa un tipo de evento NO manejado ("test_event") para que el controller no
 * llame a la API real de Mercado Pago: lo que se prueba acá es exclusivamente la
 * barrera de la firma (200 si pasa, 401 si no).</p>
 */
@ExtendWith(MockitoExtension.class)
class WebhookControllerTest {

    private static final String SECRET = "super-secreto-de-prueba";
    private static final String REQUEST_ID = "req-abc-123";
    private static final String TS = "1717171717";
    private static final String DATA_ID = "ABC123DEF"; // alfanumérico en MAYÚSCULA a propósito
    private static final String BODY = "{\"type\":\"test_event\",\"data\":{\"id\":\"" + DATA_ID + "\"}}";

    @Mock
    private SubscriptionBillingService billingService;
    @Mock
    private MercadoPagoService mercadoPagoService;

    private WebhookController controller;

    @BeforeEach
    void setUp() {
        controller = new WebhookController(billingService, mercadoPagoService);
        ReflectionTestUtils.setField(controller, "webhookSecret", SECRET);
        // En el test unitario el default del @Value no se aplica: hay que fijarlo explícito.
        ReflectionTestUtils.setField(controller, "enforceSignature", true);
    }

    /** Replica el cálculo de la spec de MP: HMAC-SHA256(secret, manifest) en hex. */
    private static String hmacHex(String secret, String manifest) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)));
    }

    private static String validSignatureHeader() throws Exception {
        String manifest = "id:" + DATA_ID.toLowerCase() + ";request-id:" + REQUEST_ID + ";ts:" + TS + ";";
        return "ts=" + TS + ",v1=" + hmacHex(SECRET, manifest);
    }

    private ResponseEntity<String> callWebhook(String xSignature, String xRequestId) {
        return controller.handleWebhook(BODY, xSignature, xRequestId, null, "test_event", null, DATA_ID);
    }

    @Test
    @DisplayName("firma válida → 200 (el data.id alfanumérico se normaliza a minúscula)")
    void validSignatureIsAccepted() throws Exception {
        ResponseEntity<String> response = callWebhook(validSignatureHeader(), REQUEST_ID);

        assertEquals(200, response.getStatusCode().value());
        assertEquals("OK", response.getBody());
    }

    @Test
    @DisplayName("firma inválida (v1 incorrecto) → 401")
    void invalidSignatureIsRejected() {
        String forged = "ts=" + TS + ",v1=" + "0".repeat(64);

        ResponseEntity<String> response = callWebhook(forged, REQUEST_ID);

        assertEquals(401, response.getStatusCode().value());
        verifyNoInteractions(billingService, mercadoPagoService);
    }

    @Test
    @DisplayName("firma calculada con OTRO secret → 401")
    void signatureWithWrongSecretIsRejected() throws Exception {
        String manifest = "id:" + DATA_ID.toLowerCase() + ";request-id:" + REQUEST_ID + ";ts:" + TS + ";";
        String forged = "ts=" + TS + ",v1=" + hmacHex("otro-secret", manifest);

        ResponseEntity<String> response = callWebhook(forged, REQUEST_ID);

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    @DisplayName("sin header x-signature → 401 (la firma es obligatoria si hay secret)")
    void missingSignatureHeaderIsRejected() {
        ResponseEntity<String> response = callWebhook(null, REQUEST_ID);

        assertEquals(401, response.getStatusCode().value());
        verifyNoInteractions(billingService, mercadoPagoService);
    }

    @Test
    @DisplayName("x-signature malformado (sin ts/v1) → 401")
    void malformedSignatureHeaderIsRejected() {
        ResponseEntity<String> response = callWebhook("basura-sin-formato", REQUEST_ID);

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    @DisplayName("firma válida pero sin x-request-id (manifest esperaba otro request-id) → 401")
    void missingRequestIdBreaksSignature() throws Exception {
        // La firma fue calculada con REQUEST_ID; si el header llega ausente, el manifest
        // se reconstruye con "" y el HMAC ya no coincide.
        ResponseEntity<String> response = callWebhook(validSignatureHeader(), null);

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    @DisplayName("válvula de lanzamiento: enforce-signature=false procesa aun con firma inválida")
    void enforcementValveAllowsInvalidSignature() {
        ReflectionTestUtils.setField(controller, "enforceSignature", false);

        ResponseEntity<String> response = callWebhook("ts=1,v1=invalida", REQUEST_ID);

        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    @DisplayName("renovación que no se pudo consultar en MP → 500 (MP reintenta; un 200 la perdería para siempre)")
    void unresolvableAuthorizedPaymentReturns500() {
        // Sin secret: se prueba el manejo del evento, no la firma.
        ReflectionTestUtils.setField(controller, "webhookSecret", "");
        when(mercadoPagoService.getAuthorizedPayment("ap-123")).thenReturn(null);

        ResponseEntity<String> response = controller.handleWebhook(
                "{\"type\":\"subscription_authorized_payment\",\"data\":{\"id\":\"ap-123\"}}",
                null, null, null, "subscription_authorized_payment", null, "ap-123");

        assertEquals(500, response.getStatusCode().value());
        verifyNoInteractions(billingService); // no se aplicó ni registró nada
    }
}
