package com.veltronik.v2.gym.services;

import com.veltronik.v2.gym.services.PeriodosDelHistorial.Cobertura;
import com.veltronik.v2.gym.services.PeriodosDelHistorial.Cobro;
import com.veltronik.v2.gym.services.PeriodosDelHistorial.Periodo;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Llena el período ESTIMADO de los cobros importados (V87), para que Pagos no muestre la
 * columna vacía en todo el historial del sistema anterior. La cuenta está en
 * {@link PeriodosDelHistorial}; acá se lee, se agrupa por persona y se escribe.
 *
 * <p><b>Nunca toca la cobertura</b>: escribe solo {@code periodo_importado_*}, que ninguna
 * cuenta de vencimientos lee. {@code period_start}/{@code period_end} de un importado siguen en
 * NULL, como exige la V86.</p>
 *
 * <p><b>Escribe con UPDATE directo y sin tocar {@code updated_at}</b>. El "deshacer" de una
 * importación se bloquea si algún cobro se editó después de importar, y lo detecta justamente
 * por {@code updated_at}. Completar los períodos no es una edición de nadie.</p>
 */
@Service
public class PeriodosDelHistorialService {

    private static final Logger log = LoggerFactory.getLogger(PeriodosDelHistorialService.class);

    /** "PÉREZ JUAN (DNI 30111222) · Cuota": así queda la nota del cobro que no se ató a un socio. */
    private static final Pattern DNI_EN_LA_NOTA = Pattern.compile("\\(DNI\\s*([0-9A-Za-z.\\-]+)\\)");
    /** Cuántas filas por UPDATE: tres parámetros cada una, lejos del tope de Postgres. */
    private static final int FILAS_POR_UPDATE = 300;

    private final EntityManager em;
    private final TransactionTemplate enTransaccion;

    public PeriodosDelHistorialService(EntityManager em, PlatformTransactionManager tx) {
        this.em = em;
        this.enTransaccion = new TransactionTemplate(tx);
    }

    /**
     * Calcula y guarda los períodos de una importación. Se puede repetir: borra los que había
     * y los vuelve a calcular con los datos de hoy.
     *
     * @return cuántos cobros quedaron con período
     */
    @Transactional
    public int calcular(UUID importacionId, UUID tenantId) {
        List<Object[]> filas = em.createNativeQuery("""
                SELECT p.id, p.member_id, p.payment_date, p.notes
                FROM gym_payment p
                WHERE p.import_id = :lote AND p.tenant_id = :gym
                """)
                .setParameter("lote", importacionId)
                .setParameter("gym", tenantId)
                .getResultList();

        Map<UUID, LocalDate> anclas = anclas(importacionId, tenantId);

        // Por persona: el socio si quedó atado; si no, el DNI o el nombre que dejó la nota.
        // Sin nada de eso el cobro va solo, sin cadena.
        Map<String, List<Cobro>> porPersona = new LinkedHashMap<>();
        Map<String, UUID> socioDeLaPersona = new HashMap<>();
        for (Object[] f : filas) {
            UUID id = aUuid(f[0]);
            UUID socio = aUuid(f[1]);
            LocalDate fecha = aFecha(f[2]);
            String nota = (String) f[3];
            Cobertura cubre = PeriodosDelHistorial.coberturaDe(nota);
            if (cubre == null || fecha == null) continue;

            String persona = socio != null ? "socio:" + socio : personaDeLaNota(nota, id);
            porPersona.computeIfAbsent(persona, k -> new ArrayList<>()).add(new Cobro(id, fecha, cubre));
            if (socio != null) socioDeLaPersona.put(persona, socio);
        }

        Map<UUID, Periodo> periodos = new HashMap<>();
        porPersona.forEach((persona, cobros) -> {
            UUID socio = socioDeLaPersona.get(persona);
            periodos.putAll(PeriodosDelHistorial.calcular(cobros, socio == null ? null : anclas.get(socio)));
        });

        em.createNativeQuery("""
                UPDATE gym_payment SET periodo_importado_desde = NULL, periodo_importado_hasta = NULL
                WHERE import_id = :lote AND tenant_id = :gym
                """)
                .setParameter("lote", importacionId)
                .setParameter("gym", tenantId)
                .executeUpdate();
        escribir(importacionId, periodos);
        em.createNativeQuery("UPDATE gym_payment_import SET periodos_at = now() WHERE id = :lote AND tenant_id = :gym")
                .setParameter("lote", importacionId)
                .setParameter("gym", tenantId)
                .executeUpdate();
        return periodos.size();
    }

    /**
     * Completa las importaciones de antes de la V87, que quedaron sin período.
     *
     * <p>Al arrancar y no en la migración: la cuenta vive en Java (con sus tests) y repetirla en
     * SQL sería tener dos versiones de la misma regla. Cada importación en su propia transacción,
     * y un error se registra sin frenar el arranque: el período es para leer, no para operar.</p>
     */
    @EventListener(ApplicationReadyEvent.class)
    public void completarLasPendientes() {
        List<Object[]> pendientes;
        try {
            pendientes = enTransaccion.execute(s -> em.createNativeQuery("""
                    SELECT id, tenant_id FROM gym_payment_import
                    WHERE periodos_at IS NULL AND deshecha_at IS NULL
                    """).getResultList());
        } catch (RuntimeException e) {
            log.warn("[periodos] no se pudieron buscar las importaciones pendientes: {}", e.getMessage());
            return;
        }
        if (pendientes == null) return;
        for (Object[] p : pendientes) {
            UUID lote = aUuid(p[0]);
            UUID gym = aUuid(p[1]);
            try {
                Integer n = enTransaccion.execute(s -> calcular(lote, gym));
                log.info("[periodos] importación {}: {} cobros con período", lote, n);
            } catch (RuntimeException e) {
                log.warn("[periodos] importación {}: no se pudieron calcular: {}", lote, e.getMessage());
            }
        }
    }

    /**
     * Hasta cuándo tenía pago cada socio al terminar el historial.
     *
     * <p>Si ya se le cobró en Veltronik, donde arrancó ese primer cobro: al cobrar dentro de la
     * gracia el período sigue desde el vencimiento de antes, que es el que trajo el padrón. Si
     * no, su vencimiento actual, que es el del padrón tal cual.</p>
     */
    private Map<UUID, LocalDate> anclas(UUID importacionId, UUID tenantId) {
        List<Object[]> filas = em.createNativeQuery("""
                SELECT m.id,
                       m.membership_end,
                       (SELECT MIN(r.period_start) FROM gym_payment r
                         WHERE r.member_id = m.id AND r.tenant_id = :gym AND r.import_id IS NULL
                           AND r.period_start IS NOT NULL AND UPPER(r.status) = 'PAID')
                FROM gym_member m
                WHERE m.tenant_id = :gym
                  AND m.id IN (SELECT DISTINCT member_id FROM gym_payment
                               WHERE import_id = :lote AND member_id IS NOT NULL)
                """)
                .setParameter("lote", importacionId)
                .setParameter("gym", tenantId)
                .getResultList();
        Map<UUID, LocalDate> anclas = new HashMap<>();
        for (Object[] f : filas) {
            LocalDate primerCobro = aFecha(f[2]);
            LocalDate ancla = primerCobro != null ? primerCobro : aFecha(f[1]);
            if (ancla != null) anclas.put(aUuid(f[0]), ancla);
        }
        return anclas;
    }

    private void escribir(UUID importacionId, Map<UUID, Periodo> periodos) {
        List<Map.Entry<UUID, Periodo>> todos = new ArrayList<>(periodos.entrySet());
        for (int i = 0; i < todos.size(); i += FILAS_POR_UPDATE) {
            List<Map.Entry<UUID, Periodo>> tanda = todos.subList(i, Math.min(i + FILAS_POR_UPDATE, todos.size()));
            StringBuilder valores = new StringBuilder();
            for (int j = 0; j < tanda.size(); j++) {
                if (j > 0) valores.append(", ");
                int base = j * 3 + 1;
                valores.append("(CAST(?").append(base).append(" AS uuid), CAST(?").append(base + 1)
                        .append(" AS date), CAST(?").append(base + 2).append(" AS date))");
            }
            var update = em.createNativeQuery("UPDATE gym_payment p "
                    + "SET periodo_importado_desde = v.desde, periodo_importado_hasta = v.hasta "
                    + "FROM (VALUES " + valores + ") AS v(id, desde, hasta) "
                    + "WHERE p.id = v.id AND p.import_id = CAST(?" + (tanda.size() * 3 + 1) + " AS uuid)");
            for (int j = 0; j < tanda.size(); j++) {
                int base = j * 3 + 1;
                update.setParameter(base, tanda.get(j).getKey().toString());
                update.setParameter(base + 1, Date.valueOf(tanda.get(j).getValue().desde()));
                update.setParameter(base + 2, Date.valueOf(tanda.get(j).getValue().hasta()));
            }
            update.setParameter(tanda.size() * 3 + 1, importacionId.toString());
            update.executeUpdate();
        }
    }

    /** Lo que devuelve una consulta nativa depende del driver: se acepta cualquiera de las dos formas. */
    private static UUID aUuid(Object v) {
        if (v == null) return null;
        return v instanceof UUID u ? u : UUID.fromString(v.toString());
    }

    private static LocalDate aFecha(Object v) {
        if (v == null) return null;
        if (v instanceof Timestamp t) return t.toLocalDateTime().toLocalDate();
        if (v instanceof java.time.LocalDateTime t) return t.toLocalDate();
        if (v instanceof Date d) return d.toLocalDate();
        if (v instanceof LocalDate d) return d;
        return LocalDate.parse(v.toString().substring(0, 10));
    }

    /** A quién pertenece un cobro sin socio: el DNI de la nota, o el nombre, o nadie. */
    private static String personaDeLaNota(String nota, UUID id) {
        Matcher dni = DNI_EN_LA_NOTA.matcher(nota);
        if (dni.find()) return "dni:" + dni.group(1).replaceAll("[.\\-]", "");
        String primera = nota.split("·")[0].trim();
        boolean esNombre = !primera.isEmpty() && PeriodosDelHistorial.coberturaDe(primera) == null
                && !"sin nombre".equalsIgnoreCase(primera) && nota.contains("·");
        return esNombre ? "nombre:" + primera.toUpperCase() : "solo:" + id;
    }
}
