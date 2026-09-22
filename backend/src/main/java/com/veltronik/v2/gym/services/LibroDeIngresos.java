package com.veltronik.v2.gym.services;

import com.veltronik.v2.gym.entities.MetodoDePago;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * ⭐⭐ EL LIBRO DE INGRESOS: la ÚNICA cuenta de "cuánta plata entró" del sistema.
 *
 * <h2>Por qué existe</h2>
 * <p>Hasta el 2026-09-22 cada pantalla sumaba la plata a su manera. El tablero contaba los
 * cobros con el historial importado; la caja los contaba sin él; Pagos sumaba en el navegador lo
 * que tenía cargado; el resumen del dueño tenía su propia consulta; y ninguna contaba las ventas
 * anotadas en la caja. El mismo gimnasio, el mismo mes, cuatro números distintos, y ninguno
 * estaba "mal" según su propia regla. Con un solo cliente migrado ya se vio: el año de la caja
 * decía $283.000 y el del tablero, millones.</p>
 *
 * <p>Ahora todas preguntan acá: el tablero, Pagos, el balance y el Excel de la caja, y el
 * resumen del dueño. Una sola consulta, contada en la base.</p>
 *
 * <h2>Qué es un ingreso</h2>
 * <ul>
 *   <li><b>Cuotas</b>: los cobros hechos en Veltronik, cobrados (no pendientes, no anulados).</li>
 *   <li><b>Historial</b>: los cobros importados del sistema anterior (ADR-014). Suman en los
 *       ingresos, marcados aparte: esa plata entró, pero la cobró el otro sistema.</li>
 *   <li><b>Otros ingresos</b>: las ventas y demás ingresos anotados en la caja. Es el lugar
 *       provisorio de la cantina, que va a escribir acá mismo.</li>
 * </ul>
 * <p>⚠️ <b>Un aporte o un retiro del dueño NO es un ingreso</b> ({@code CajaMovimiento
 * #esMovimientoDeFondos}): mueve el cajón, pero es plata que ya era del dueño.</p>
 *
 * <h2>La garantía</h2>
 * <p>Cada peso está en una forma de pago y en un origen, así que las dos cuentas suman lo mismo:
 * {@code efectivo + transferencia + mercadopago + tarjeta + otros = cuotas + historial +
 * otrosIngresos = total}. Lo verifica {@code LibroDeIngresosIntegrationTest}, y el invariante
 * de que todas las pantallas dicen el mismo número para el mismo período,
 * {@code UnSoloNumeroIntegrationTest}.</p>
 *
 * <h2>Por qué nativa</h2>
 * <p>Para agrupar por mes en Postgres ({@code date_trunc}) y para poder sumar varias sucursales
 * del mismo dueño: el filtro de tenant de Hibernate acotaría un JPQL a la sucursal del contexto
 * (ver {@code GymOwnerInsightsService}). La lista de gimnasios la arma siempre el servidor.</p>
 *
 * <p>Los rangos son <b>semiabiertos</b>, {@code [desde, hasta)}: el día 30 termina donde empieza
 * el 1°, sin el 23:59:59.999 que Postgres redondeaba al día siguiente.</p>
 */
@Service
public class LibroDeIngresos {

    /** Desde el principio: para las preguntas que no tienen "desde" (la serie del tablero). */
    public static final LocalDateTime DESDE_SIEMPRE = LocalDateTime.of(1970, 1, 1, 0, 0);

    private static final String ASIENTOS = """
            SELECT p.tenant_id AS tenant_id, p.payment_date AS fecha,
                   CASE WHEN p.import_id IS NULL THEN 'CUOTAS' ELSE 'HISTORIAL' END AS origen,
                   p.payment_method AS metodo, p.amount AS monto
              FROM gym_payment p
             WHERE p.tenant_id IN (:ids)
               AND p.status = 'paid'
               AND p.payment_date >= :desde AND p.payment_date < :hasta
            UNION ALL
            SELECT m.tenant_id, m.fecha, 'OTROS_INGRESOS', m.metodo, m.monto
              FROM caja_movimiento m
             WHERE m.tenant_id IN (:ids)
               AND m.tipo = 'INGRESO'
               AND m.anulado_at IS NULL
               AND m.import_id IS NULL
               AND lower(btrim(m.categoria)) NOT IN ('aporte', 'retiro')
               AND m.fecha >= :desde AND m.fecha < :hasta
            """;

    private final EntityManager em;

    public LibroDeIngresos(EntityManager em) {
        this.em = em;
    }

    /** Lo que entró en {@code [desde, hasta)}. */
    @Transactional(readOnly = true)
    public Totales entre(UUID gimnasio, LocalDateTime desde, LocalDateTime hasta) {
        Totales t = Totales.VACIO;
        for (Object fila : consultar("""
                SELECT l.origen, l.metodo, SUM(l.monto), COUNT(*)
                  FROM (""" + ASIENTOS + ") l GROUP BY 1, 2", List.of(gimnasio), desde, hasta)) {
            Object[] c = (Object[]) fila;
            t = t.mas((String) c[0], (String) c[1], (BigDecimal) c[2], ((Number) c[3]).intValue());
        }
        return t;
    }

    /** Lo que entró en días de calendario, con los dos extremos adentro. */
    @Transactional(readOnly = true)
    public Totales enLosDias(UUID gimnasio, LocalDate desde, LocalDate hasta) {
        return entre(gimnasio, desde.atStartOfDay(), hasta.plusDays(1).atStartOfDay());
    }

    /** Lo que entró cada mes de {@code [desde, hasta)}, del más viejo al más nuevo. Sin meses vacíos. */
    @Transactional(readOnly = true)
    public TreeMap<YearMonth, Totales> porMes(UUID gimnasio, LocalDateTime desde, LocalDateTime hasta) {
        return porMes(List.of(gimnasio), desde, hasta).getOrDefault(gimnasio, new TreeMap<>());
    }

    /** Lo mismo para varias sucursales a la vez (el resumen del dueño). */
    @Transactional(readOnly = true)
    public Map<UUID, TreeMap<YearMonth, Totales>> porMes(List<UUID> gimnasios, LocalDateTime desde,
                                                         LocalDateTime hasta) {
        Map<UUID, TreeMap<YearMonth, Totales>> out = new HashMap<>();
        if (gimnasios.isEmpty()) return out;
        for (Object fila : consultar("""
                SELECT l.tenant_id, to_char(date_trunc('month', l.fecha), 'YYYY-MM'), l.origen, l.metodo,
                       SUM(l.monto), COUNT(*)
                  FROM (""" + ASIENTOS + ") l GROUP BY 1, 2, 3, 4", gimnasios, desde, hasta)) {
            Object[] c = (Object[]) fila;
            YearMonth mes = YearMonth.parse((String) c[1]);
            out.computeIfAbsent((UUID) c[0], k -> new TreeMap<>())
                    .merge(mes, Totales.VACIO.mas((String) c[2], (String) c[3], (BigDecimal) c[4],
                            ((Number) c[5]).intValue()), Totales::sumar);
        }
        return out;
    }

    /** Cuándo entró el primer peso. Si fue avanzado el mes, ese primer mes está incompleto. */
    @Transactional(readOnly = true)
    public LocalDateTime primerIngreso(UUID gimnasio) {
        Object r = em.createNativeQuery("SELECT MIN(l.fecha) FROM (" + ASIENTOS + ") l")
                .setParameter("ids", List.of(gimnasio))
                .setParameter("desde", DESDE_SIEMPRE)
                .setParameter("hasta", LocalDateTime.of(3000, 1, 1, 0, 0))
                .getSingleResult();
        if (r == null) return null;
        if (r instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return (LocalDateTime) r;
    }

    private List<?> consultar(String sql, List<UUID> gimnasios, LocalDateTime desde, LocalDateTime hasta) {
        return em.createNativeQuery(sql)
                .setParameter("ids", gimnasios)
                .setParameter("desde", desde)
                .setParameter("hasta", hasta)
                .getResultList();
    }

    /**
     * Lo que entró, contado de las dos maneras: por forma de pago y por origen. Las dos suman
     * {@link #total()}.
     */
    public record Totales(BigDecimal efectivo, BigDecimal transferencia, BigDecimal mercadopago,
                          BigDecimal tarjeta, BigDecimal otros,
                          BigDecimal cuotas, BigDecimal historial, BigDecimal otrosIngresos,
                          int cantidadCuotas, int cantidadHistorial, int cantidadOtrosIngresos) {

        public static final Totales VACIO = new Totales(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0, 0, 0);

        /** Todo lo que entró. */
        public BigDecimal total() {
            return cuotas.add(historial).add(otrosIngresos);
        }

        /** Transferencia y Mercado Pago: lo que está en el banco. */
        public BigDecimal digital() {
            return transferencia.add(mercadopago);
        }

        /** Lo cobrado a socios: lo de Veltronik más lo importado. Es lo que lista Pagos. */
        public BigDecimal cobrado() {
            return cuotas.add(historial);
        }

        public int cantidadCobros() {
            return cantidadCuotas + cantidadHistorial;
        }

        /** Suma un grupo de asientos (un origen, una forma de pago). */
        Totales mas(String origen, String metodo, BigDecimal monto, int cuantos) {
            BigDecimal m = monto == null ? BigDecimal.ZERO : monto;
            BigDecimal ef = efectivo, tr = transferencia, mp = mercadopago, ta = tarjeta, ot = otros;
            switch (MetodoDePago.normalizar(metodo)) {
                case MetodoDePago.EFECTIVO -> ef = ef.add(m);
                case MetodoDePago.TRANSFERENCIA -> tr = tr.add(m);
                case MetodoDePago.MERCADO_PAGO -> mp = mp.add(m);
                case MetodoDePago.TARJETA -> ta = ta.add(m);
                default -> ot = ot.add(m);
            }
            return switch (origen) {
                case "CUOTAS" -> new Totales(ef, tr, mp, ta, ot, cuotas.add(m), historial, otrosIngresos,
                        cantidadCuotas + cuantos, cantidadHistorial, cantidadOtrosIngresos);
                case "HISTORIAL" -> new Totales(ef, tr, mp, ta, ot, cuotas, historial.add(m), otrosIngresos,
                        cantidadCuotas, cantidadHistorial + cuantos, cantidadOtrosIngresos);
                default -> new Totales(ef, tr, mp, ta, ot, cuotas, historial, otrosIngresos.add(m),
                        cantidadCuotas, cantidadHistorial, cantidadOtrosIngresos + cuantos);
            };
        }

        public static Totales sumar(Totales a, Totales b) {
            return new Totales(a.efectivo.add(b.efectivo), a.transferencia.add(b.transferencia),
                    a.mercadopago.add(b.mercadopago), a.tarjeta.add(b.tarjeta), a.otros.add(b.otros),
                    a.cuotas.add(b.cuotas), a.historial.add(b.historial), a.otrosIngresos.add(b.otrosIngresos),
                    a.cantidadCuotas + b.cantidadCuotas, a.cantidadHistorial + b.cantidadHistorial,
                    a.cantidadOtrosIngresos + b.cantidadOtrosIngresos);
        }

        /** Lo que viaja a las pantallas, con los nombres que ya usaban. */
        public Map<String, Object> comoMapa() {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("total", total());
            m.put("efectivo", efectivo);
            m.put("transferencia", transferencia);
            m.put("mercadopago", mercadopago);
            m.put("tarjeta", tarjeta);
            m.put("otros", otros);
            m.put("digital", digital());
            m.put("cuotas", cuotas);
            m.put("historial", historial);
            m.put("otrosIngresos", otrosIngresos);
            m.put("cobrado", cobrado());
            m.put("cantidadCobros", cantidadCobros());
            m.put("cantidadCuotas", cantidadCuotas);
            m.put("cantidadHistorial", cantidadHistorial);
            m.put("cantidadOtrosIngresos", cantidadOtrosIngresos);
            return m;
        }
    }
}
