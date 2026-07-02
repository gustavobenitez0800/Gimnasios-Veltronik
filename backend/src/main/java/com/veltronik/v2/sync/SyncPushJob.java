package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * El DRENADOR oportunista del outbox (ladrillo 4, ADR-010): cada tick intenta empujar
 * un lote hacia la nube; si no hay internet, silencio y se reintenta en el próximo —
 * la definición misma de "sincronización oportunista" (ADR-001).
 *
 * <p><b>Garantía de entrega:</b> las filas del outbox se borran SOLO tras el 2xx de la
 * nube (at-least-once). Si el mismo lote llega dos veces, la idempotencia del otro lado
 * (ON CONFLICT DO NOTHING) lo vuelve inofensivo.</p>
 *
 * <p><b>Identidad:</b> usa la credencial del bautizo vía properties
 * ({@code veltronik.sync.*} / env {@code VELTRONIK_SYNC_*}). Sin configurar → el job
 * queda dormido (el cableado automático post-enrolamiento llega en la próxima tajada).</p>
 */
@Slf4j
@Component
@Profile("local")
public class SyncPushJob {

    private static final int BATCH_SIZE = 200;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final String cloudUrl;
    private final String deviceId;
    private final String deviceKey;
    private final RestClient restClient;

    public SyncPushJob(JdbcTemplate jdbcTemplate,
                       ObjectMapper objectMapper,
                       @Value("${veltronik.sync.cloud-url:}") String cloudUrl,
                       @Value("${veltronik.sync.device-id:}") String deviceId,
                       @Value("${veltronik.sync.device-key:}") String deviceKey) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.cloudUrl = cloudUrl == null ? "" : cloudUrl.trim();
        this.deviceId = deviceId == null ? "" : deviceId.trim();
        this.deviceKey = deviceKey == null ? "" : deviceKey.trim();
        this.restClient = RestClient.create();
    }

    private boolean configured() {
        return !cloudUrl.isBlank() && !deviceId.isBlank() && !deviceKey.isBlank();
    }

    @Scheduled(fixedDelayString = "${veltronik.sync.push-interval-ms:30000}", initialDelay = 45000)
    public void drainOutbox() {
        if (!configured()) return;

        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, table_name, row_id, op, payload::text AS payload "
                            + "FROM sync_outbox ORDER BY id LIMIT " + BATCH_SIZE);
            if (rows.isEmpty()) return;

            List<Map<String, Object>> changes = rows.stream().map(r -> {
                Map<String, Object> change = new HashMap<>();
                change.put("table", r.get("table_name"));
                change.put("op", r.get("op"));
                change.put("rowId", r.get("row_id").toString());
                try {
                    change.put("row", objectMapper.readTree((String) r.get("payload")));
                } catch (Exception e) {
                    throw new IllegalStateException("Payload ilegible en outbox id=" + r.get("id"), e);
                }
                return change;
            }).toList();

            restClient.post()
                    .uri(cloudUrl + "/api/sync/push")
                    .header("X-Device-Id", deviceId)
                    .header("X-Device-Key", deviceKey)
                    .body(Map.of("changes", changes))
                    .retrieve()
                    .toBodilessEntity();

            // 2xx: recién ahora se vacía lo enviado (at-least-once).
            List<Long> sentIds = rows.stream().map(r -> ((Number) r.get("id")).longValue()).toList();
            String placeholders = String.join(",", sentIds.stream().map(i -> "?").toList());
            jdbcTemplate.update("DELETE FROM sync_outbox WHERE id IN (" + placeholders + ")",
                    sentIds.toArray());

            log.info("Sync: {} cambios empujados a la nube", sentIds.size());
        } catch (Exception e) {
            // Offline o nube caída = lo NORMAL de este job: se reintenta en el próximo tick.
            log.debug("Sync pospuesto ({}): {}", e.getClass().getSimpleName(), e.getMessage());
        }
    }
}
