package com.veltronik.v2.courts.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.entities.*;
import com.veltronik.v2.courts.integration.GeminiClient;
import com.veltronik.v2.courts.integration.WhatsAppClient;
import com.veltronik.v2.courts.repositories.CourtConversationMessageRepository;
import com.veltronik.v2.courts.repositories.CourtConversationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * El cerebro del bot: orquesta el loop de function-calling de Gemini sobre las
 * {@link CourtBotTools}, mantiene la memoria de la conversación y maneja el handoff
 * (cuando no entiende o piden una persona, se calla y avisa).
 *
 * <p>Corre <b>async</b>: el webhook le responde 200 a Meta al instante y el trabajo
 * pesado (Gemini + tools + WhatsApp) sigue en otro hilo. Como no hay request web, este
 * hilo setea el {@link TenantContextHolder} a mano para que el filtro multi-tenant de
 * Hibernate scope-e las consultas — y lo limpia al final.</p>
 */
@Service
@Slf4j
public class CourtBotService {

    private static final int MAX_TOOL_STEPS = 5;
    private static final String HANDOFF_MSG =
            "Te paso con alguien del complejo 🙌 En un ratito te responden por acá.";
    private static final String FALLBACK_MSG =
            "Perdón, no te entendí bien. Te paso con una persona del complejo para que te ayude. 🙌";

    private final ObjectMapper mapper = new ObjectMapper();

    private final CourtConversationRepository conversationRepository;
    private final CourtConversationMessageRepository messageRepository;
    private final CourtSettingsService settingsService;
    private final TenantRepository tenantRepository;
    private final CourtBotTools tools;
    private final GeminiClient gemini;
    private final WhatsAppClient whatsApp;

    public CourtBotService(CourtConversationRepository conversationRepository,
                           CourtConversationMessageRepository messageRepository,
                           CourtSettingsService settingsService,
                           TenantRepository tenantRepository,
                           CourtBotTools tools,
                           GeminiClient gemini,
                           WhatsAppClient whatsApp) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.settingsService = settingsService;
        this.tenantRepository = tenantRepository;
        this.tools = tools;
        this.gemini = gemini;
        this.whatsApp = whatsApp;
    }

    /** ¿El bot puede operar globalmente? (sin API key de Gemini, no hay bot). */
    public boolean isGloballyEnabled() {
        return gemini.isConfigured();
    }

    /**
     * Procesa un mensaje entrante. Async: no bloquea la respuesta 200 a Meta.
     * Setea el contexto de tenant para todo el hilo (Hibernate filtra por él).
     */
    @Async("botExecutor")
    public void handleInboundAsync(UUID tenantId, String waPhone, String waMessageId,
                                   String userText, String profileName) {
        TenantContextHolder.setTenantId(tenantId);
        try {
            handleInbound(tenantId, waPhone, waMessageId, userText, profileName);
        } catch (Exception e) {
            log.error("Bot: error procesando mensaje de {} (tenant {}): {}", waPhone, tenantId, e.getMessage(), e);
        } finally {
            TenantContextHolder.clear();
        }
    }

    private void handleInbound(UUID tenantId, String waPhone, String waMessageId,
                               String userText, String profileName) {
        // Idempotencia: Meta reentrega notificaciones.
        if (waMessageId != null && messageRepository.existsByWaMessageId(waMessageId)) {
            log.info("Bot: mensaje {} ya procesado, se ignora.", waMessageId);
            return;
        }

        CourtConversation conv = conversationRepository
                .findByTenantIdAndWaUserPhone(tenantId, waPhone)
                .orElseGet(() -> newConversation(tenantId, waPhone));

        // Siempre guardamos el mensaje del cliente (memoria / contexto para la persona).
        saveMessage(tenantId, conv, CourtMessageRole.USER, userText, waMessageId);
        conv.setLastMessageAt(LocalDateTime.now());
        conversationRepository.save(conv);

        // En handoff el bot se queda callado: lo atiende una persona.
        if (conv.getStatus() == CourtConversationStatus.HUMAN_HANDOFF) {
            log.info("Bot: conversación {} en handoff, no se responde.", conv.getId());
            return;
        }

        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();
        String system = buildSystemPrompt(tenantId, settings);
        ArrayNode contents = buildHistory(conv);
        ArrayNode toolDecls = tools.declarations();
        CourtBotTools.BotContext ctx = new CourtBotTools.BotContext(waPhone);

        for (int step = 0; step < MAX_TOOL_STEPS; step++) {
            GeminiClient.GeminiTurn turn;
            try {
                turn = gemini.generate(system, contents, toolDecls);
            } catch (Exception e) {
                log.error("Bot: Gemini falló, handoff. {}", e.getMessage());
                handoff(conv, settings, waPhone, FALLBACK_MSG);
                return;
            }

            if (turn.isFunctionCall()) {
                if (CourtBotTools.FN_REQUEST_HUMAN.equals(turn.functionName())) {
                    log.info("Bot: request_human en conversación {} ({}).", conv.getId(),
                            turn.args() != null ? turn.args().path("reason").asText("") : "");
                    handoff(conv, settings, waPhone, HANDOFF_MSG);
                    return;
                }
                // Append la llamada del modelo y la respuesta de la función, y seguimos el loop.
                appendFunctionCall(contents, turn.functionName(), turn.args());
                ObjectNode result = tools.execute(turn.functionName(), turn.args(), ctx);
                appendFunctionResponse(contents, turn.functionName(), result);
                continue;
            }

            // Respuesta de texto final → enviar y guardar.
            String reply = turn.text() == null ? "" : turn.text().trim();
            if (reply.isEmpty()) {
                handoff(conv, settings, waPhone, FALLBACK_MSG);
                return;
            }
            sendAndSave(conv, settings, waPhone, reply);
            return;
        }

        // Se acabaron los pasos sin una respuesta final → fallback + handoff.
        log.warn("Bot: se agotaron los {} pasos de tools en conversación {}.", MAX_TOOL_STEPS, conv.getId());
        handoff(conv, settings, waPhone, FALLBACK_MSG);
    }

    // ─────────────────────────── armado de contexto ───────────────────────────

    private String buildSystemPrompt(UUID tenantId, CourtSettings settings) {
        String venue = tenantRepository.findById(tenantId).map(Tenant::getName).orElse("el complejo");
        LocalDate today = LocalDate.now();
        String[] days = {"", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};
        String dow = days[today.getDayOfWeek().getValue()];

        StringBuilder sb = new StringBuilder();
        sb.append("Sos el asistente de reservas de \"").append(venue).append("\", un complejo de canchas de fútbol 5, ")
          .append("y atendés por WhatsApp a sus clientes. Hablás en español rioplatense (vos), cordial y breve, ")
          .append("como un encargado canchero pero profesional. Mensajes cortos, sin sonar robot.\n\n");
        sb.append("Hoy es ").append(dow).append(" ").append(today).append(". Resolvé fechas relativas ('hoy', ")
          .append("'mañana', 'el viernes') a una fecha YYYY-MM-DD antes de usar las funciones.\n\n");
        sb.append("Qué podés hacer:\n");
        sb.append("- Informar horarios libres (get_availability) y precios (get_prices). NUNCA inventes ")
          .append("disponibilidad ni precios: siempre consultá las funciones.\n");
        sb.append("- Reservar un turno con create_hold. Queda ESPERANDO SEÑA: explicale al cliente que para ")
          .append("confirmarlo tiene que transferir la seña");
        if (settings.getPaymentAlias() != null && !settings.getPaymentAlias().isBlank()) {
            sb.append(" al alias ").append(settings.getPaymentAlias());
        }
        sb.append(" y mandar el comprobante, y que si no paga a tiempo el turno se libera solo.\n");
        sb.append("- Si el cliente es nuevo, pedile el nombre antes de reservar.\n");
        sb.append("- Si no podés resolver algo, es un reclamo, o piden hablar con una persona, usá request_human.\n\n");
        sb.append("No prometas nada que no puedas hacer con las funciones (no cobrás, no cancelás turnos). ")
          .append("Ante la duda, derivá con request_human.");
        if (settings.getBotInstructions() != null && !settings.getBotInstructions().isBlank()) {
            sb.append("\n\nDatos del complejo:\n").append(settings.getBotInstructions().trim());
        }
        return sb.toString();
    }

    /** Reconstruye el array contents de Gemini desde la memoria (texto cliente/asistente). */
    private ArrayNode buildHistory(CourtConversation conv) {
        List<CourtConversationMessage> recent =
                messageRepository.findTop20ByConversationIdOrderByCreatedAtDesc(conv.getId());
        Collections.reverse(recent); // a orden cronológico
        ArrayNode contents = mapper.createArrayNode();
        for (CourtConversationMessage m : recent) {
            String role = (m.getRole() == CourtMessageRole.ASSISTANT) ? "model" : "user";
            ObjectNode c = contents.addObject();
            c.put("role", role);
            c.putArray("parts").addObject().put("text", m.getContent());
        }
        return contents;
    }

    private void appendFunctionCall(ArrayNode contents, String name, JsonNode args) {
        ObjectNode call = mapper.createObjectNode();
        call.put("name", name);
        call.set("args", args == null ? mapper.createObjectNode() : args);
        contents.addObject().put("role", "model").putArray("parts").addObject().set("functionCall", call);
    }

    private void appendFunctionResponse(ArrayNode contents, String name, ObjectNode result) {
        ObjectNode resp = mapper.createObjectNode();
        resp.put("name", name);
        resp.set("response", result);
        contents.addObject().put("role", "user").putArray("parts").addObject().set("functionResponse", resp);
    }

    // ─────────────────────────── salida ───────────────────────────

    private void sendAndSave(CourtConversation conv, CourtSettings settings, String waPhone, String text) {
        boolean sent = whatsApp.sendText(settings.getWaPhoneNumberId(), settings.getWaAccessToken(), waPhone, text);
        if (sent) {
            saveMessage(conv.getTenant().getId(), conv, CourtMessageRole.ASSISTANT, text, null);
        }
    }

    private void handoff(CourtConversation conv, CourtSettings settings, String waPhone, String text) {
        conv.setStatus(CourtConversationStatus.HUMAN_HANDOFF);
        conv.setHandoffAt(LocalDateTime.now());
        conversationRepository.save(conv);
        sendAndSave(conv, settings, waPhone, text);
    }

    private CourtConversation newConversation(UUID tenantId, String waPhone) {
        CourtConversation c = new CourtConversation();
        Tenant t = new Tenant();
        t.setId(tenantId);
        c.setTenant(t);
        c.setWaUserPhone(waPhone);
        c.setStatus(CourtConversationStatus.ACTIVE);
        c.setLastMessageAt(LocalDateTime.now());
        return conversationRepository.save(c);
    }

    private void saveMessage(UUID tenantId, CourtConversation conv, CourtMessageRole role,
                             String content, String waMessageId) {
        CourtConversationMessage m = new CourtConversationMessage();
        Tenant t = new Tenant();
        t.setId(tenantId);
        m.setTenant(t);
        m.setConversation(conv);
        m.setRole(role);
        m.setContent(content != null ? content : "");
        m.setWaMessageId(waMessageId);
        messageRepository.save(m);
    }
}
