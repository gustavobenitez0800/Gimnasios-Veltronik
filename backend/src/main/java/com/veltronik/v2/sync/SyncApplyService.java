package com.veltronik.v2.sync;

import com.veltronik.v2.core.exceptions.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * El APLICADOR del sync engine (ladrillo 4, ADR-010): materializa lotes de filas con
 * la regla de su categoría (SyncTableRegistry).
 *
 * <ul>
 *   <li><b>EVENTO:</b> {@code INSERT ... ON CONFLICT (id) DO NOTHING} — cada evento nace
 *       con su UUID en el dispositivo (Fase 0): un reintento jamás duplica una venta.</li>
 *   <li><b>MAESTRO:</b> upsert genérico — {@code ON CONFLICT (id) DO UPDATE SET (cols) =
 *       (excluded.cols)}, con la lista de columnas cacheada de information_schema y una
 *       guardia anti robo-de-fila: el UPDATE solo procede si la fila existente pertenece
 *       al MISMO tenant.</li>
 * </ul>
 *
 * <p><b>Guardia multi-tenant (camino push):</b> el {@code tenant_id} de CADA fila se PISA
 * con el del equipo autenticado vía {@code jsonb_set} — el payload jamás decide a qué
 * tenant escribe. El camino de CONFIG (pull, aplicado en el local con payload que emite
 * NUESTRA nube) usa {@link #applyConfig} sin estampado.</p>
 *
 * <p><b>Genérico de verdad:</b> {@code jsonb_populate_record(NULL::tabla, payload)} mapea
 * el JSON del trigger a la fila destino por nombre de columna — posible porque ambos
 * lados corren el MISMO motor con el MISMO esquema (dividendo del ADR-009). El nombre de
 * tabla sale SIEMPRE del registro (whitelist), nunca del payload.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SyncApplyService {

    private final JdbcTemplate jdbcTemplate;
    private final SyncTableRegistry registry;

    /** Columnas por tabla (sin {@code id}), cacheadas de information_schema para el upsert. */
    private final Map<String, List<String>> columnsCache = new ConcurrentHashMap<>();

    /** Resultado de un lote: filas que cambiaron algo vs. las que ya estaban. */
    public record ApplyResult(int applied, int skipped) {}

    /**
     * Aplica un lote del PUSH (eventos + maestros) en una sola transacción, en el ORDEN
     * del registro (maestros y padres primero, sin importar cómo vino el lote).
     * Todo-o-nada: si una fila viola una FK, el lote entero se revierte y el outbox
     * local lo reintentará.
     */
    @Transactional
    public ApplyResult apply(UUID tenantId, UUID deviceId, List<SyncChange> changes) {
        if (tenantId == null) throw new BusinessException("Equipo sin sucursal enrolada.");

        // Validar TODO antes de tocar la base.
        for (SyncChange change : changes) {
            SyncTableRegistry.SyncTable table = registry.findPushTable(change.getTable())
                    .orElseThrow(() -> new BusinessException("Tabla no sincronizable: " + change.getTable()));
            boolean opValida = switch (table.kind()) {
                case EVENT -> "INSERT".equalsIgnoreCase(change.getOp());
                case MASTER -> "INSERT".equalsIgnoreCase(change.getOp()) || "UPDATE".equalsIgnoreCase(change.getOp());
                case CONFIG -> false; // la config BAJA por /pull; el push jamás la acepta
            };
            if (!opValida) {
                throw new BusinessException("Operación " + change.getOp() + " no soportada para " + change.getTable());
            }
        }

        int applied = 0;
        int skipped = 0;
        List<SyncChange> ordered = changes.stream()
                .sorted(Comparator.comparingInt(c -> registry.pushOrderOf(c.getTable())))
                .toList();

        for (SyncChange change : ordered) {
            SyncTableRegistry.SyncTable table = registry.findPushTable(change.getTable()).orElseThrow();
            // El tenant del payload se pisa SIEMPRE con el del equipo autenticado.
            String stamped = "jsonb_set(?::jsonb, '{tenant_id}', to_jsonb(?::uuid))";
            int affected = switch (table.kind()) {
                case EVENT -> jdbcTemplate.update(
                        "INSERT INTO " + table.name() + " SELECT * FROM jsonb_populate_record(NULL::"
                                + table.name() + ", " + stamped + ") ON CONFLICT (id) DO NOTHING",
                        change.getRow().toString(), tenantId);
                case MASTER -> jdbcTemplate.update(
                        upsertSql(table.name(), stamped),
                        change.getRow().toString(), tenantId);
                case CONFIG -> 0; // inalcanzable (validado arriba)
            };
            if (affected > 0) applied++; else skipped++;
        }

        if (applied > 0) {
            log.info("Sync del equipo {}: {} filas aplicadas, {} sin cambios (tenant {})",
                    deviceId, applied, skipped, tenantId);
        }
        return new ApplyResult(applied, skipped);
    }

    /**
     * Aplica en el LOCAL la config bajada por /pull (upsert sin estampado de tenant:
     * el payload lo emite nuestra propia nube, y la tabla {@code tenant} ni siquiera
     * tiene columna tenant_id).
     */
    @Transactional
    public ApplyResult applyConfig(List<SyncChange> changes) {
        int applied = 0;
        for (SyncChange change : changes) {
            SyncTableRegistry.SyncTable table = registry.configTables().stream()
                    .filter(t -> t.name().equals(change.getTable()))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException("Tabla de config desconocida: " + change.getTable()));
            applied += jdbcTemplate.update(
                    upsertSql(table.name(), "?::jsonb"),
                    change.getRow().toString());
        }
        return new ApplyResult(applied, 0);
    }

    /**
     * Upsert genérico: columnas (sin id) desde information_schema, cacheadas. La guardia
     * {@code WHERE t.tenant_id = excluded.tenant_id} evita que una colisión de UUID entre
     * tenants pise una fila ajena (defensa en profundidad; con UUIDv4 es teórico).
     */
    private String upsertSql(String table, String payloadExpr) {
        List<String> columns = columnsCache.computeIfAbsent(table, t -> jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_schema = 'public' AND table_name = ? AND column_name <> 'id' "
                        + "ORDER BY ordinal_position",
                String.class, t));
        if (columns.isEmpty()) throw new IllegalStateException("Tabla sin columnas en el esquema: " + table);

        String setList = columns.stream().map(c -> c + " = excluded." + c).collect(Collectors.joining(", "));
        boolean tenantScoped = columns.contains("tenant_id");
        String guard = tenantScoped ? " WHERE " + table + ".tenant_id = excluded.tenant_id" : "";

        return "INSERT INTO " + table + " SELECT * FROM jsonb_populate_record(NULL::" + table + ", "
                + payloadExpr + ") ON CONFLICT (id) DO UPDATE SET " + setList + guard;
    }
}
