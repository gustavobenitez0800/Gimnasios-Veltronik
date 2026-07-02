package com.veltronik.v2.sync;

import com.veltronik.v2.core.exceptions.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * La mitad NUBE del sync engine (ladrillo 4, ADR-010): aplica lotes del outbox local
 * con idempotencia total.
 *
 * <p><b>La regla de los eventos:</b> {@code INSERT ... ON CONFLICT (id) DO NOTHING} —
 * como cada evento nace con su UUID en el dispositivo (Fase 0), un reintento del push
 * jamás duplica una venta: la segunda llegada choca con la PK y se ignora.</p>
 *
 * <p><b>Guardia multi-tenant:</b> el {@code tenant_id} de CADA fila se PISA con el del
 * equipo autenticado (el de su enrolamiento) vía {@code jsonb_set} — el payload del
 * cliente jamás decide a qué tenant escribe. Mismo trato para {@code origin_device_id}
 * si viniera vacío.</p>
 *
 * <p><b>Genérico de verdad:</b> {@code jsonb_populate_record(NULL::tabla, payload)}
 * mapea el JSON del trigger a la fila destino por nombre de columna — posible porque
 * ambos lados corren el MISMO motor con el MISMO esquema (el dividendo del ADR-009).
 * El nombre de tabla sale SIEMPRE del registro (whitelist), nunca del payload.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SyncApplyService {

    private final JdbcTemplate jdbcTemplate;
    private final SyncTableRegistry registry;

    /** Resultado de un lote: cuántas filas se insertaron y cuántas ya existían. */
    public record ApplyResult(int applied, int skipped) {}

    /**
     * Aplica un lote en una sola transacción, en el ORDEN del registro (padres antes
     * que hijos, sin importar cómo vino el lote). Todo-o-nada: si una fila viola una
     * FK, el lote entero se revierte y el outbox local lo reintentará.
     */
    @Transactional
    public ApplyResult apply(UUID tenantId, UUID deviceId, List<SyncChange> changes) {
        if (tenantId == null) throw new BusinessException("Equipo sin sucursal enrolada.");

        // Validar TODO antes de tocar la base.
        for (SyncChange change : changes) {
            if (registry.orderOf(change.getTable()) < 0) {
                throw new BusinessException("Tabla no sincronizable: " + change.getTable());
            }
            if (!"INSERT".equalsIgnoreCase(change.getOp())) {
                throw new BusinessException("Operación no soportada en v1: " + change.getOp());
            }
        }

        int applied = 0;
        int skipped = 0;
        List<SyncChange> ordered = changes.stream()
                .sorted(Comparator.comparingInt(c -> registry.orderOf(c.getTable())))
                .toList();

        for (SyncChange change : ordered) {
            // Tabla desde el REGISTRO (whitelist) — jamás interpolamos texto del cliente.
            String table = registry.find(change.getTable()).orElseThrow().name();
            String sql = "INSERT INTO " + table + " "
                    + "SELECT * FROM jsonb_populate_record(NULL::" + table + ", "
                    + "  jsonb_set(?::jsonb, '{tenant_id}', to_jsonb(?::uuid))"
                    + ") ON CONFLICT (id) DO NOTHING";
            int inserted = jdbcTemplate.update(sql, change.getRow().toString(), tenantId);
            if (inserted > 0) applied++; else skipped++;
        }

        if (applied > 0) {
            log.info("Sync del equipo {}: {} filas aplicadas, {} ya existían (tenant {})",
                    deviceId, applied, skipped, tenantId);
        }
        return new ApplyResult(applied, skipped);
    }
}
