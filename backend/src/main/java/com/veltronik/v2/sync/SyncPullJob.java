package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.List;

/**
 * La BAJADA oportunista de config (ladrillo 4 tajada 2, ADR-010): cada tick pide a la
 * nube lo que cambió después del watermark y lo aplica local como upsert. El dueño toca
 * el catálogo de precios en la web → baja al local en el próximo tick con internet.
 *
 * <p><b>Orden watermark-seguro:</b> primero se APLICA, después se persiste el watermark —
 * si el proceso muere en el medio, el próximo pull repite (y el upsert lo vuelve inofensivo).</p>
 */
@Slf4j
@Component
@Profile("local")
@RequiredArgsConstructor
public class SyncPullJob {

    static final String WATERMARK_KEY = "pull_watermark";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final SyncApplyService applyService;
    private final SyncIdentity identity;
    private final RestClient restClient = RestClient.create();

    @Scheduled(fixedDelayString = "${veltronik.sync.pull-interval-ms:60000}", initialDelay = 60000)
    public void pullConfig() {
        if (!identity.configured()) return;

        try {
            List<String> stored = jdbcTemplate.queryForList(
                    "SELECT value FROM sync_state WHERE key = ?", String.class, WATERMARK_KEY);
            String since = stored.isEmpty() ? "" : stored.get(0);

            String uri = UriComponentsBuilder.fromUriString(identity.getCloudUrl() + "/api/sync/pull")
                    .queryParam("since", since)
                    .build().toUriString();
            JsonNode body = restClient.get()
                    .uri(uri)
                    .header("X-Device-Id", identity.getDeviceId())
                    .header("X-Device-Key", identity.getDeviceKey())
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null) return;

            List<SyncChange> changes = new ArrayList<>();
            for (JsonNode node : body.path("changes")) {
                changes.add(objectMapper.treeToValue(node, SyncChange.class));
            }

            if (!changes.isEmpty()) {
                applyService.applyConfig(changes);
                log.info("Sync: {} filas de config bajadas de la nube", changes.size());
            }

            String watermark = body.path("watermark").asText("");
            if (!watermark.isBlank()) {
                jdbcTemplate.update("INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, now()) "
                        + "ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()",
                        WATERMARK_KEY, watermark);
            }
        } catch (Exception e) {
            // Offline = lo normal: se reintenta en el próximo tick.
            log.debug("Sync pull pospuesto ({}): {}", e.getClass().getSimpleName(), e.getMessage());
        }
    }
}
