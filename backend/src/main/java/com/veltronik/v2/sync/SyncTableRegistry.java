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
 *   <li><b>en qué orden</b> se aplican (padres antes que hijos, por las FKs; maestros
 *       antes que los eventos que los referencian);</li>
 *   <li><b>con qué regla</b> por categoría (los tres ríos de DATA-CLASSIFICATION).</li>
 * </ul>
 *
 * <p>Agregar una tabla al sync = una línea acá (+ su lugar en el orden). Nada más.</p>
 */
@Component
public class SyncTableRegistry {

    /** Los tres ríos de DATA-CLASSIFICATION, con su regla de aplicación. */
    public enum Kind {
        /** Sube. Append-only: INSERT ... ON CONFLICT DO NOTHING (idempotencia por UUID). */
        EVENT,
        /** Sube. Mutable con dueño local: upsert genérico (INSERT o UPDATE del trigger). */
        MASTER,
        /** Baja. Dueño = la nube: se sirve por /pull con watermark y se aplica local como upsert. */
        CONFIG
    }

    /**
     * Una tabla sincronizable. {@code tenantColumn}: la columna que ata la fila a su
     * sucursal — {@code tenant_id} en todas salvo la tabla {@code tenant}, cuya PK ES el id.
     */
    public record SyncTable(String name, Kind kind, String tenantColumn) {
        public SyncTable(String name, Kind kind) {
            this(name, kind, "tenant_id");
        }
    }

    /**
     * Tablas que SUBEN (push), EN ORDEN de aplicación: maestros primero (los eventos los
     * referencian), padres antes que hijos (kiosk_sale exige cash_session).
     */
    private static final List<SyncTable> PUSH_TABLES = List.of(
            // Maestros locales (dueño = la sucursal; la web los lee)
            new SyncTable("kiosk_category", Kind.MASTER),
            new SyncTable("kiosk_supplier", Kind.MASTER),
            new SyncTable("kiosk_customer", Kind.MASTER),
            new SyncTable("kiosk_product", Kind.MASTER),
            // Eventos (append-only)
            new SyncTable("kiosk_cash_session", Kind.EVENT),
            new SyncTable("kiosk_sale", Kind.EVENT),
            new SyncTable("kiosk_sale_item", Kind.EVENT),
            new SyncTable("kiosk_sale_payment", Kind.EVENT)
    );

    /** Tablas que BAJAN (pull): config cuya fuente de verdad es la nube. */
    private static final List<SyncTable> CONFIG_TABLES = List.of(
            new SyncTable("tenant", Kind.CONFIG, "id"),
            new SyncTable("kiosk_settings", Kind.CONFIG),
            // Cajeros con PIN (ladrillo 5): bajan los hashes → el login diario es offline.
            new SyncTable("cashier", Kind.CONFIG)
    );

    public List<SyncTable> pushTables() {
        return PUSH_TABLES;
    }

    public List<SyncTable> configTables() {
        return CONFIG_TABLES;
    }

    /** Busca una tabla del camino de SUBIDA (el push jamás acepta tablas de config). */
    public Optional<SyncTable> findPushTable(String tableName) {
        return PUSH_TABLES.stream().filter(t -> t.name().equals(tableName)).findFirst();
    }

    /** Posición en el orden de aplicación del push (menor = primero). -1 si no está permitida. */
    public int pushOrderOf(String tableName) {
        for (int i = 0; i < PUSH_TABLES.size(); i++) {
            if (PUSH_TABLES.get(i).name().equals(tableName)) return i;
        }
        return -1;
    }
}
