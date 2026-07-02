package com.veltronik.v2.sync;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * El REGISTRO DE TABLAS sincronizables (ladrillo 4, ADR-010): la codificación en código
 * de docs/DATA-CLASSIFICATION.md. Es la única fuente de verdad de:
 *
 * <ul>
 *   <li><b>qué</b> tablas viajan por el sync (whitelist — también es la defensa contra
 *       SQL injection: el nombre de tabla JAMÁS sale del payload, sale de acá);</li>
 *   <li><b>en qué orden</b> se aplican (padres antes que hijos, por las FKs);</li>
 *   <li><b>con qué regla</b> (v1: EVENTO = INSERT ... ON CONFLICT DO NOTHING —
 *       idempotencia por UUID pre-asignado; MAESTRO/upsert llega en la próxima tajada).</li>
 * </ul>
 *
 * <p>Agregar una tabla al sync = una línea acá (+ su lugar en el orden). Nada más.</p>
 *
 * <p><b>Por qué solo la familia de la venta en v1:</b> kiosk_sale_item.product_id es FK
 * NULLABLE (viaja el snapshot del nombre/precio), así que las ventas sincronizan sin
 * depender del catálogo. Los maestros locales (productos, clientes) requieren el flujo
 * de upsert y van ANTES de los eventos que los referencian — próxima tajada.</p>
 */
@Component
public class SyncTableRegistry {

    /** Categoría de la tabla (define la regla de aplicación). */
    public enum Kind { EVENT }

    /** Una tabla sincronizable: nombre físico + categoría. */
    public record SyncTable(String name, Kind kind) {}

    /** EN ORDEN de aplicación: padres antes que hijos (kiosk_sale exige cash_session). */
    private static final List<SyncTable> TABLES = List.of(
            new SyncTable("kiosk_cash_session", Kind.EVENT),
            new SyncTable("kiosk_sale", Kind.EVENT),
            new SyncTable("kiosk_sale_item", Kind.EVENT),
            new SyncTable("kiosk_sale_payment", Kind.EVENT)
    );

    public List<SyncTable> tables() {
        return TABLES;
    }

    public Optional<SyncTable> find(String tableName) {
        return TABLES.stream().filter(t -> t.name().equals(tableName)).findFirst();
    }

    /** Posición en el orden de aplicación (menor = primero). -1 si no está permitida. */
    public int orderOf(String tableName) {
        for (int i = 0; i < TABLES.size(); i++) {
            if (TABLES.get(i).name().equals(tableName)) return i;
        }
        return -1;
    }
}
