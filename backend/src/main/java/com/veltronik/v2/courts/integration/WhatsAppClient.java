package com.veltronik.v2.courts.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
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
 * Cliente del WhatsApp Cloud API (Meta Graph) para responderle al cliente.
 *
 * <p>Multi-tenant: el {@code phoneNumberId} y el {@code accessToken} salen de la config
 * de CADA complejo ({@code court_settings}), no de una constante global.</p>
 */
@Component
@Slf4j
public class WhatsAppClient {

    private static final String ENDPOINT = "https://graph.facebook.com/%s/%s/messages";

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${whatsapp.graph-version:v21.0}")
    private String graphVersion;

    /** Envía un mensaje de texto. Devuelve true si Meta lo aceptó. */
    public boolean sendText(String phoneNumberId, String accessToken, String toPhone, String text) {
        if (phoneNumberId == null || accessToken == null) {
            log.warn("WhatsApp sin phoneNumberId/token configurado: no se envía.");
            return false;
        }
        try {
            ObjectNode body = mapper.createObjectNode();
            body.put("messaging_product", "whatsapp");
            body.put("to", toPhone);
            body.put("type", "text");
            body.putObject("text").put("body", text);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(String.format(ENDPOINT, graphVersion, phoneNumberId)))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + accessToken)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("WhatsApp send → HTTP {}: {}", response.statusCode(), truncate(response.body()));
                return false;
            }
            return true;
        } catch (Exception e) {
            log.error("Error enviando WhatsApp a {}: {}", toPhone, e.getMessage());
            return false;
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 500 ? s.substring(0, 500) + "…" : s;
    }
}
