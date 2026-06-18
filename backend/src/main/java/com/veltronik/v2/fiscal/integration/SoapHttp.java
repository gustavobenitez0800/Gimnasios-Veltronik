package com.veltronik.v2.fiscal.integration;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * POST SOAP genérico hacia ARCA (mismo estilo que {@code WhatsAppClient} de courts: HttpClient
 * nativo, timeouts acotados). Un solo lugar con la mecánica HTTP → alta cohesión.
 */
@Component
public class SoapHttp {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    /**
     * @param soapAction valor del header SOAPAction (puede ser cadena vacía, como en WSAA).
     * @return el body de la respuesta (2xx). Un no-2xx se considera falla de ARCA → {@link ArcaException}.
     */
    public String post(String url, String soapAction, String body) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "text/xml; charset=utf-8")
                    .header("SOAPAction", soapAction)
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new ArcaException("ARCA respondió HTTP " + response.statusCode() + ": " + truncate(response.body()));
            }
            return response.body();
        } catch (IOException e) {
            throw new ArcaException("Error de red con ARCA: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ArcaException("Llamada a ARCA interrumpida", e);
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 600 ? s.substring(0, 600) + "…" : s;
    }
}
