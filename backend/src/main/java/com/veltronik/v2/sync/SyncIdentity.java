package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * La identidad del equipo para el sync headless (ladrillo 4 + cableado): URL de la nube
 * + credencial del bautizo. Sin identidad, los jobs de sync duermen.
 *
 * <p><b>Resolución (en orden):</b></p>
 * <ol>
 *   <li>Properties/env ({@code VELTRONIK_SYNC_*}) — override manual/pruebas;</li>
 *   <li>El archivo {@code sync-identity.json} (default {@code %LOCALAPPDATA%\Veltronik\}),
 *       que Electron escribe cuando el dueño enrola ESTA máquina desde la app — el
 *       cableado automático: bautizo → credencial → cerebro local, sin tocar nada.</li>
 * </ol>
 *
 * <p>El archivo se RE-LEE en cada resolución (los jobs corren cada 30-60s): enrolar con
 * el cerebro ya corriendo activa el sync en el próximo tick, sin reinicios.</p>
 */
@Slf4j
@Component
@Profile("local")
public class SyncIdentity {

    public record Identity(String cloudUrl, String deviceId, String deviceKey) {}

    private final String propCloudUrl;
    private final String propDeviceId;
    private final String propDeviceKey;
    private final Path identityFile;
    private final ObjectMapper objectMapper;

    public SyncIdentity(@Value("${veltronik.sync.cloud-url:}") String cloudUrl,
                        @Value("${veltronik.sync.device-id:}") String deviceId,
                        @Value("${veltronik.sync.device-key:}") String deviceKey,
                        @Value("${veltronik.sync.identity-file:}") String identityFile,
                        ObjectMapper objectMapper) {
        this.propCloudUrl = trimmed(cloudUrl);
        this.propDeviceId = trimmed(deviceId);
        this.propDeviceKey = trimmed(deviceKey);
        this.identityFile = resolveIdentityFile(trimmed(identityFile));
        this.objectMapper = objectMapper;
    }

    /** La identidad vigente, si existe. Los jobs la piden en cada tick. */
    public Optional<Identity> resolve() {
        if (!propCloudUrl.isBlank() && !propDeviceId.isBlank() && !propDeviceKey.isBlank()) {
            return Optional.of(new Identity(normalizeUrl(propCloudUrl), propDeviceId, propDeviceKey));
        }
        try {
            if (!Files.exists(identityFile)) return Optional.empty();
            JsonNode json = objectMapper.readTree(Files.readAllBytes(identityFile));
            String cloudUrl = json.path("cloudUrl").asText("");
            String deviceId = json.path("deviceId").asText("");
            String deviceKey = json.path("deviceKey").asText("");
            if (cloudUrl.isBlank() || deviceId.isBlank() || deviceKey.isBlank()) return Optional.empty();
            return Optional.of(new Identity(normalizeUrl(cloudUrl), deviceId.trim(), deviceKey.trim()));
        } catch (Exception e) {
            // Archivo corrupto ≠ operación rota: el sync duerme y se loguea el porqué.
            log.warn("sync-identity.json ilegible ({}): {}", identityFile, e.getMessage());
            return Optional.empty();
        }
    }

    /** El job de push/pull agrega /api/sync/...: acá se normaliza cola de /api o barras. */
    private static String normalizeUrl(String url) {
        String normalized = url.trim();
        while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        if (normalized.endsWith("/api")) normalized = normalized.substring(0, normalized.length() - 4);
        return normalized;
    }

    private static Path resolveIdentityFile(String configured) {
        if (!configured.isBlank()) return Path.of(configured);
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null && !localAppData.isBlank()) {
            return Path.of(localAppData, "Veltronik", "sync-identity.json");
        }
        return Path.of(System.getProperty("user.home"), ".veltronik", "sync-identity.json");
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }
}
