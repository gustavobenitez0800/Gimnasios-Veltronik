package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * La BAJADA de config (ladrillo 4 tajada 2, ADR-010): sirve al equipo las filas de las
 * tablas CONFIG de su tenant modificadas después del watermark.
 *
 * <p><b>Watermark honesto:</b> el nuevo watermark es el mayor {@code updated_at} de las
 * filas DEVUELTAS (no "ahora"): una fila que commitee entre la consulta y la respuesta
 * queda para el próximo pull — nunca se saltea nada.</p>
 */
@Service
@RequiredArgsConstructor
public class SyncPullService {

    /** El principio de los tiempos: primer pull = baja todo. */
    public static final LocalDateTime EPOCH = LocalDateTime.of(1970, 1, 1, 0, 0);

    private final JdbcTemplate jdbcTemplate;
    private final SyncTableRegistry registry;
    private final ObjectMapper objectMapper;

    public record PullResult(List<SyncChange> changes, LocalDateTime watermark) {}

    @SneakyThrows
    public PullResult pull(UUID tenantId, LocalDateTime since) {
        List<SyncChange> changes = new ArrayList<>();
        LocalDateTime watermark = since;

        for (SyncTableRegistry.SyncTable table : registry.configTables()) {
            // Tabla y columna salen del REGISTRO (whitelist), jamás del cliente.
            String sql = "SELECT id, updated_at, to_jsonb(" + table.name() + ".*)::text AS row "
                    + "FROM " + table.name()
                    + " WHERE " + table.tenantColumn() + " = ? AND updated_at > ? ORDER BY updated_at";
            for (Map<String, Object> row : jdbcTemplate.queryForList(sql, tenantId, Timestamp.valueOf(since))) {
                SyncChange change = new SyncChange();
                change.setTable(table.name());
                change.setOp("UPSERT");
                change.setRowId((UUID) row.get("id"));
                change.setRow(objectMapper.readTree((String) row.get("row")));
                changes.add(change);

                LocalDateTime updatedAt = ((Timestamp) row.get("updated_at")).toLocalDateTime();
                if (updatedAt.isAfter(watermark)) watermark = updatedAt;
            }
        }
        return new PullResult(changes, watermark);
    }
}
