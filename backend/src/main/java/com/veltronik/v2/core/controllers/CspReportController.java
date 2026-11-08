package com.veltronik.v2.core.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.veltronik.v2.core.security.FrenoPorMinuto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * ⭐ El buzón de la política de seguridad de la web (08/11/2026).
 *
 * <p>La web manda una Content-Security-Policy «en observación» (Report-Only, en
 * {@code frontend/vercel.json}): no frena nada, pero cuando la hubiera frenado, el navegador del
 * que la está usando avisa acá. Cada aviso deja UNA línea con la marca {@link #MARCA} en los
 * registros de Cloud Run. Con una semana sin avisos de verdad, la política pasa a frenar en serio
 * sabiendo que no rompe nada — en vez de enterarse por un dueño que no pudo pagar con tarjeta.</p>
 *
 * <p>Entiende los dos formatos que mandan los navegadores: el viejo de {@code report-uri}
 * ({@code {"csp-report": {...}}}) y el de la Reporting API (una lista de {@code csp-violation}).</p>
 *
 * <p><b>Lo que NO se anota:</b> lo que bloquean las extensiones del navegador (no es nuestro y
 * no se arregla acá) y la parte de la dirección después del {@code ?}: los enlaces de los correos
 * llevan ahí un código de un solo uso, y un registro no es lugar para eso.</p>
 *
 * <p>Es una puerta pública, así que tiene techo: {@link #REPORTES_POR_MINUTO} por copia del
 * servidor. Lo que pase de ahí se descarta en silencio (igual contesta 204, como siempre).</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/public")
public class CspReportController {

    public static final String MARCA = "CSP BLOQUEARIA";
    static final int REPORTES_POR_MINUTO = 60;

    private final ObjectMapper json;
    private final FrenoPorMinuto frenos = new FrenoPorMinuto();

    public CspReportController(ObjectMapper json) {
        this.json = json;
    }

    @PostMapping(value = "/csp-report", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Void> reportar(@RequestBody(required = false) String cuerpo) {
        if (cuerpo == null || cuerpo.isBlank()) return ResponseEntity.noContent().build();
        if (frenos.frenado("csp", REPORTES_POR_MINUTO, REPORTES_POR_MINUTO)) return ResponseEntity.noContent().build();
        frenos.registrar("csp", false);

        for (JsonNode r : leer(cuerpo)) {
            String bloqueado = texto(r, "blocked-uri", "blockedURL");
            String fuente = texto(r, "source-file", "sourceFile");
            if (esDeUnaExtension(bloqueado) || esDeUnaExtension(fuente)) continue;
            log.warn("{} · directiva={} · bloqueado={} · página={} · fuente={}",
                    MARCA,
                    limpio(texto(r, "effective-directive", "effectiveDirective", "violated-directive"), 60),
                    limpio(sinConsulta(bloqueado), 200),
                    limpio(sinConsulta(texto(r, "document-uri", "documentURL")), 200),
                    limpio(sinConsulta(fuente), 200));
        }
        return ResponseEntity.noContent().build();
    }

    /** Los avisos que trae el pedido, en cualquiera de los dos formatos. Lo que no se entiende, se ignora. */
    private List<JsonNode> leer(String cuerpo) {
        List<JsonNode> avisos = new ArrayList<>();
        try {
            JsonNode raiz = json.readTree(cuerpo);
            if (raiz == null) return avisos;
            if (raiz.has("csp-report")) {
                avisos.add(raiz.get("csp-report"));
            } else if (raiz.isArray()) {
                for (JsonNode item : raiz) {
                    if (avisos.size() >= 20) break;   // un pedido no trae más que eso de verdad
                    if ("csp-violation".equals(item.path("type").asText()) && item.has("body")) avisos.add(item.get("body"));
                }
            }
        } catch (Exception e) {
            // Un cuerpo roto es ruido, no un error: no se anota nada.
        }
        return avisos;
    }

    private static String texto(JsonNode nodo, String... nombres) {
        for (String n : nombres) {
            JsonNode v = nodo.get(n);
            if (v != null && !v.isNull() && !v.asText().isBlank()) return v.asText();
        }
        return null;
    }

    private static boolean esDeUnaExtension(String uri) {
        return uri != null && uri.matches("(?i)^(chrome|moz|safari|safari-web|ms-browser)-extension:.*");
    }

    /** Sin lo que va después de ? o #: ahí viajan los códigos de un solo uso de los correos. */
    static String sinConsulta(String uri) {
        if (uri == null) return null;
        int corte = uri.length();
        int q = uri.indexOf('?');
        int h = uri.indexOf('#');
        if (q >= 0) corte = Math.min(corte, q);
        if (h >= 0) corte = Math.min(corte, h);
        return uri.substring(0, corte);
    }

    private static String limpio(String texto, int tope) {
        if (texto == null || texto.isBlank()) return "?";
        String unaLinea = texto.replaceAll("[\\r\\n\\t]+", " ").trim();
        return unaLinea.length() <= tope ? unaLinea : unaLinea.substring(0, tope) + "…";
    }
}
