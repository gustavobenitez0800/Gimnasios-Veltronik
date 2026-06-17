package com.veltronik.v2.courts.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.veltronik.v2.courts.entities.CourtSettings;
import com.veltronik.v2.courts.repositories.CourtSettingsRepository;
import com.veltronik.v2.courts.services.CourtBotService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Webhook del WhatsApp Cloud API (Meta). Público (no JWT), igual que el de Mercado Pago.
 *
 * <p><b>GET</b>: verificación del webhook al configurarlo en Meta (devuelve el challenge si
 * el verify_token coincide). <b>POST</b>: mensajes entrantes. Resuelve el tenant por el
 * {@code phone_number_id} del complejo y delega el procesamiento al bot de forma ASYNC,
 * devolviendo 200 al instante (Meta reintenta si tardamos).</p>
 */
@RestController
@RequestMapping("/api/webhooks/whatsapp")
@Slf4j
public class WhatsAppWebhookController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final CourtSettingsRepository settingsRepository;
    private final CourtBotService botService;

    @Value("${whatsapp.verify-token:}")
    private String verifyToken;

    public WhatsAppWebhookController(CourtSettingsRepository settingsRepository, CourtBotService botService) {
        this.settingsRepository = settingsRepository;
        this.botService = botService;
    }

    /** Verificación del webhook (Meta lo llama una vez al configurarlo). */
    @GetMapping
    public ResponseEntity<String> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                         @RequestParam(name = "hub.verify_token", required = false) String token,
                                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if ("subscribe".equals(mode) && verifyToken != null && !verifyToken.isBlank() && verifyToken.equals(token)) {
            return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(challenge);
        }
        log.warn("WhatsApp webhook verify rechazado (mode={}, token coincide={}).", mode, verifyToken != null && verifyToken.equals(token));
        return ResponseEntity.status(403).body("Forbidden");
    }

    /** Mensajes entrantes. Siempre 200 (rápido); el bot procesa async. */
    @PostMapping
    public ResponseEntity<String> inbound(@RequestBody String rawBody) {
        try {
            JsonNode root = MAPPER.readTree(rawBody);
            for (JsonNode entry : root.path("entry")) {
                for (JsonNode change : entry.path("changes")) {
                    processChange(change.path("value"));
                }
            }
        } catch (Exception e) {
            log.error("WhatsApp webhook: body ilegible: {}", e.getMessage());
        }
        return ResponseEntity.ok("OK"); // siempre 200: evitamos reintentos de Meta
    }

    private void processChange(JsonNode value) {
        JsonNode messages = value.path("messages");
        if (!messages.isArray() || messages.isEmpty()) return; // status/delivery: ignorar

        String phoneNumberId = value.path("metadata").path("phone_number_id").asText(null);
        if (phoneNumberId == null) return;

        CourtSettings settings = settingsRepository.findByWaPhoneNumberId(phoneNumberId).orElse(null);
        if (settings == null || !settings.isBotEnabled() || !botService.isGloballyEnabled()) {
            log.info("WhatsApp entrante para phone_number_id {} sin bot activo: ignorado.", phoneNumberId);
            return;
        }
        UUID tenantId = settings.getTenant().getId();

        String profileName = value.path("contacts").path(0).path("profile").path("name").asText(null);

        for (JsonNode msg : messages) {
            if (!"text".equals(msg.path("type").asText())) continue; // v1: solo texto
            String from = msg.path("from").asText(null);
            String waMessageId = msg.path("id").asText(null);
            String text = msg.path("text").path("body").asText(null);
            if (from == null || text == null || text.isBlank()) continue;

            botService.handleInboundAsync(tenantId, from, waMessageId, text, profileName);
        }
    }
}
