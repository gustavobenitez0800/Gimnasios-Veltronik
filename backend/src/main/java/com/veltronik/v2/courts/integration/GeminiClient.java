package com.veltronik.v2.courts.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Cliente del Gemini API (Google AI) para {@code generateContent} con function calling.
 *
 * <p>Contrato REST (v1beta): el modelo devuelve, en {@code candidates[0].content.parts},
 * o un {@code text} o un {@code functionCall {name, args}} (role "model"). La respuesta de
 * la función se reenvía como un part {@code functionResponse} con role "user". Auth por
 * header {@code x-goog-api-key}.</p>
 *
 * <p>Sin estado de conversación: el orquestador ({@code CourtBotService}) arma el array
 * {@code contents} y maneja el loop de tool-calls.</p>
 */
@Component
@Slf4j
public class GeminiClient {

    private static final String ENDPOINT =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${gemini.api-key:}")
    private String apiKey;

    @Value("${gemini.model:gemini-2.5-flash}")
    private String model;

    /** ¿Hay API key configurada? Sin esto el bot no arranca. */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Un turno del modelo: o texto, o una llamada a función (nunca ambos acá). */
    public record GeminiTurn(String text, String functionName, JsonNode args) {
        public boolean isFunctionCall() {
            return functionName != null;
        }
    }

    /**
     * Llama a generateContent. {@code contents} y {@code tools} se construyen afuera
     * (el orquestador y {@code CourtBotTools}). Devuelve el primer part relevante.
     */
    public GeminiTurn generate(String systemInstruction, ArrayNode contents, ArrayNode tools) {
        ObjectNode root = mapper.createObjectNode();

        ObjectNode sys = root.putObject("systemInstruction");
        sys.putArray("parts").addObject().put("text", systemInstruction);

        root.set("contents", contents);

        if (tools != null && !tools.isEmpty()) {
            root.set("tools", tools);
        }
        root.putObject("generationConfig").put("temperature", 0.3);

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(String.format(ENDPOINT, model)))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("x-goog-api-key", apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)))
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("Gemini {} → HTTP {}: {}", model, response.statusCode(), truncate(response.body()));
                throw new IllegalStateException("Gemini respondió " + response.statusCode());
            }
            return parse(mapper.readTree(response.body()));
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error llamando a Gemini: {}", e.getMessage());
            throw new IllegalStateException("No se pudo contactar a Gemini", e);
        }
    }

    private GeminiTurn parse(JsonNode body) {
        JsonNode parts = body.path("candidates").path(0).path("content").path("parts");
        if (parts.isArray()) {
            for (JsonNode part : parts) {
                JsonNode fc = part.get("functionCall");
                if (fc != null && fc.hasNonNull("name")) {
                    return new GeminiTurn(null, fc.get("name").asText(), fc.path("args"));
                }
            }
            for (JsonNode part : parts) {
                if (part.hasNonNull("text")) {
                    return new GeminiTurn(part.get("text").asText(), null, null);
                }
            }
        }
        // Sin parts utilizables (p.ej. bloqueo por safety): devolvemos texto vacío → fallback.
        log.warn("Gemini sin parts de texto/función. promptFeedback={}", body.path("promptFeedback"));
        return new GeminiTurn("", null, null);
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 500 ? s.substring(0, 500) + "…" : s;
    }
}
