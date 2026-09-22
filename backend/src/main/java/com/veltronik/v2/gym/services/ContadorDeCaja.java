package com.veltronik.v2.gym.services;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * ⭐⭐ LO QUE ENTRA EN UN CIERRE DE CAJA, Y EL SELLO QUE HACE QUE ENTRE EN UNO SOLO (V88).
 *
 * <h2>La regla</h2>
 * <p>Un cierre toma lo cobrado en Veltronik que <b>ningún cierre contó todavía</b> (sin sello),
 * sin mirar si la fecha cae en "su" período. Lo único que pide es que haya pasado antes del
 * momento del cierre: {@code LEAST(alta, fecha) <= hasta}.</p>
 * <ul>
 *   <li>Un cobro cargado HOY con la fecha de ayer, o a las 00:00 (el modal de Pagos): antes
 *       caía en un período ya cerrado y no lo contaba nadie. Ahora lo toma el próximo cierre.</li>
 *   <li>Un pendiente que se marca pagado días después: lo mismo.</li>
 *   <li>⭐ El cierre de anoche hecho sin internet que sube a la mañana: los cobros de la mañana
 *       tienen alta Y fecha posteriores a su momento, así que no los toma (regla 4 de la fase 3).
 *       Los de anoche que subieron a la mañana, sí: su fecha es de antes.</li>
 * </ul>
 *
 * <h2>Lo que se corrige después de cerrado</h2>
 * <p>El sello guarda lo que contó el cierre ({@code sellado_monto}, {@code sellado_metodo}). Si
 * después el cobro se corrige o se anula, el cierre siguiente toma la diferencia como
 * CORRECCIÓN, a la vista, y re-sella con el valor nuevo. El cierre viejo no se reescribe.</p>
 *
 * <h2>Lo muy viejo</h2>
 * <p>Un cierre mira hasta {@link CajaService#DIAS_QUE_MIRA_UN_CIERRE} días para atrás. Lo sin
 * sellar más viejo que eso es CARGA HISTÓRICA —alguien pasó al sistema los cobros de un
 * cuaderno—: esa plata ya no está en el cajón. Se sella sin cierre, así no queda "pendiente"
 * para siempre, y sigue sumando en el libro de ingresos por su fecha.</p>
 *
 * <h2>Por qué SQL directo y con bloqueo</h2>
 * <p>Leer y sellar tienen que ver las MISMAS filas. Con {@code FOR UPDATE} una edición que llega
 * en el medio espera a que el cierre termine (y entonces sale como corrección en el siguiente),
 * y lo que se da de alta en el medio queda sin sello para el siguiente. Los tres pedidos —el
 * resumen de la pantalla, la lista de cobros y el cierre— comparten el mismo {@code WHERE}.</p>
 */
@Component
public class ContadorDeCaja {

    /** Lo cobrado en Veltronik sin sello, hasta el momento del cierre. */
    private static final String COBROS_SIN_SELLAR = """
              FROM gym_payment p
              LEFT JOIN gym_member s ON s.id = p.member_id
             WHERE p.tenant_id = :gym
               AND p.sellado_at IS NULL
               AND p.import_id IS NULL
               AND p.status = 'paid'
               AND p.payment_date >= :piso
               AND (p.created_at <= :hasta OR p.payment_date <= :hasta)
            """;

    /** Lo ya cerrado cuyo valor de hoy no es el que contó su cierre. */
    private static final String COBROS_CORREGIDOS = """
              FROM gym_payment p
              LEFT JOIN gym_member s ON s.id = p.member_id
             WHERE p.tenant_id = :gym
               AND p.cierre_id IS NOT NULL
               AND p.updated_at <= :hasta
               AND ((p.status = 'paid' AND (p.amount <> p.sellado_monto OR p.payment_method <> p.sellado_metodo))
                    OR (p.status <> 'paid' AND p.sellado_monto <> 0))
            """;

    private static final String MOVIMIENTOS_SIN_SELLAR = """
              FROM caja_movimiento m
             WHERE m.tenant_id = :gym
               AND m.sellado_at IS NULL
               AND m.import_id IS NULL
               AND m.fecha >= :piso
               AND (m.created_at <= :hasta OR m.fecha <= :hasta)
            """;

    /** Hasta cuántas filas por UPDATE: un primer cierre puede traer un mes entero de cobros. */
    private static final int DE_A = 1000;

    private final EntityManager em;

    ContadorDeCaja(EntityManager em) {
        this.em = em;
    }

    /** Un cobro que entra en el cierre. */
    public record Cobro(UUID id, LocalDateTime fecha, BigDecimal monto, String metodo, String socio) { }

    /**
     * Un cobro ya cerrado que cambió: lo que contó su cierre y lo que vale hoy. Un anulado vale
     * cero, con el mismo método (la plata sale por donde entró).
     */
    public record Correccion(UUID pagoId, LocalDateTime fecha, String socio,
                      String metodoAntes, BigDecimal montoAntes, String metodoDespues, BigDecimal montoDespues) { }

    /** Un gasto o un ingreso de caja que entra en el cierre (anulados incluidos: se sellan igual). */
    public record Movimiento(UUID id, String tipo, String categoria, String metodo, BigDecimal monto, boolean vigente) { }

    public record PorCerrar(List<Cobro> cobros, List<Correccion> correcciones, List<Movimiento> movimientos) { }

    /**
     * Lo que entraría en un cierre hecho en {@code hasta}.
     *
     * @param bloquear true solo para cerrar: bloquea esas filas hasta el fin de la transacción.
     */
    PorCerrar leer(UUID gym, LocalDateTime hasta, LocalDateTime piso, boolean bloquear) {
        String candado = bloquear ? " FOR UPDATE OF p" : "";

        List<Cobro> cobros = new ArrayList<>();
        for (Object f : em.createNativeQuery("""
                        SELECT p.id, p.payment_date, p.amount, p.payment_method,
                               NULLIF(btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), '')
                        """ + COBROS_SIN_SELLAR + " ORDER BY p.payment_date, p.id" + candado)
                .setParameter("gym", gym).setParameter("hasta", hasta).setParameter("piso", piso)
                .getResultList()) {
            Object[] c = (Object[]) f;
            cobros.add(new Cobro((UUID) c[0], fecha(c[1]), (BigDecimal) c[2], (String) c[3], (String) c[4]));
        }

        List<Correccion> correcciones = new ArrayList<>();
        for (Object f : em.createNativeQuery("""
                        SELECT p.id, p.payment_date, p.status, p.amount, p.payment_method,
                               p.sellado_monto, p.sellado_metodo,
                               NULLIF(btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), '')
                        """ + COBROS_CORREGIDOS + " ORDER BY p.payment_date, p.id" + candado)
                .setParameter("gym", gym).setParameter("hasta", hasta)
                .getResultList()) {
            Object[] c = (Object[]) f;
            boolean cobrado = "paid".equals(c[2]);
            String metodoAntes = (String) c[6];
            correcciones.add(new Correccion((UUID) c[0], fecha(c[1]), (String) c[7],
                    metodoAntes, (BigDecimal) c[5],
                    cobrado ? (String) c[4] : metodoAntes,
                    cobrado ? (BigDecimal) c[3] : BigDecimal.ZERO));
        }

        List<Movimiento> movimientos = new ArrayList<>();
        for (Object f : em.createNativeQuery("""
                        SELECT m.id, m.tipo, m.categoria, m.metodo, m.monto, (m.anulado_at IS NULL)
                        """ + MOVIMIENTOS_SIN_SELLAR + " ORDER BY m.fecha, m.id" + (bloquear ? " FOR UPDATE" : ""))
                .setParameter("gym", gym).setParameter("hasta", hasta).setParameter("piso", piso)
                .getResultList()) {
            Object[] c = (Object[]) f;
            movimientos.add(new Movimiento((UUID) c[0], (String) c[1], (String) c[2], (String) c[3],
                    (BigDecimal) c[4], Boolean.TRUE.equals(c[5])));
        }

        return new PorCerrar(cobros, correcciones, movimientos);
    }

    /**
     * Un candado por gimnasio que dura lo que dura la transacción.
     *
     * <p>Dos cierres a la vez (el portal y el escritorio en el mismo minuto) leerían el mismo
     * cierre anterior y el mismo fondo: el segundo guardaría un cajón calculado sobre un fondo
     * que ya no existe. Con el candado, el segundo espera, y al entrar ve el cierre del primero.</p>
     */
    void candado(UUID gym) {
        em.createNativeQuery("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(hashtext(:clave))) AS c")
                .setParameter("clave", "caja:" + gym)
                .getSingleResult();
    }

    /** Sella los cobros que tomó el cierre. Devuelve cuántos selló: tienen que ser todos. */
    int sellarCobros(UUID gym, List<UUID> ids, UUID cierre, LocalDateTime ahora) {
        int n = 0;
        for (List<UUID> tanda : tandas(ids)) {
            n += em.createNativeQuery("""
                            UPDATE gym_payment
                               SET cierre_id = :cierre, sellado_at = :ahora,
                                   sellado_monto = amount, sellado_metodo = payment_method
                             WHERE tenant_id = :gym AND id IN (:ids) AND sellado_at IS NULL
                            """)
                    .setParameter("cierre", cierre).setParameter("ahora", ahora)
                    .setParameter("gym", gym).setParameter("ids", tanda)
                    .executeUpdate();
        }
        return n;
    }

    int sellarMovimientos(UUID gym, List<UUID> ids, UUID cierre, LocalDateTime ahora) {
        int n = 0;
        for (List<UUID> tanda : tandas(ids)) {
            n += em.createNativeQuery("""
                            UPDATE caja_movimiento SET cierre_id = :cierre, sellado_at = :ahora
                             WHERE tenant_id = :gym AND id IN (:ids) AND sellado_at IS NULL
                            """)
                    .setParameter("cierre", cierre).setParameter("ahora", ahora)
                    .setParameter("gym", gym).setParameter("ids", tanda)
                    .executeUpdate();
        }
        return n;
    }

    /** La corrección ya entró en un cierre: desde ahora, el valor contado es el de hoy. */
    void resellar(UUID pagoId, BigDecimal monto, String metodo, LocalDateTime ahora) {
        em.createNativeQuery("""
                        UPDATE gym_payment SET sellado_monto = :monto, sellado_metodo = :metodo, sellado_at = :ahora
                         WHERE id = :id
                        """)
                .setParameter("monto", monto).setParameter("metodo", metodo)
                .setParameter("ahora", ahora).setParameter("id", pagoId)
                .executeUpdate();
    }

    /**
     * Lo sin sellar más viejo que la ventana del cierre: carga histórica. Se sella sin cierre
     * —ningún arqueo lo cuenta— para que no quede pendiente para siempre.
     */
    int sellarHistoricos(UUID gym, LocalDateTime piso, LocalDateTime ahora) {
        int cobros = em.createNativeQuery("""
                        UPDATE gym_payment
                           SET sellado_at = :ahora, sellado_monto = amount, sellado_metodo = payment_method
                         WHERE tenant_id = :gym AND sellado_at IS NULL AND import_id IS NULL
                           AND status = 'paid' AND payment_date < :piso
                        """)
                .setParameter("ahora", ahora).setParameter("gym", gym).setParameter("piso", piso)
                .executeUpdate();
        int movimientos = em.createNativeQuery("""
                        UPDATE caja_movimiento SET sellado_at = :ahora
                         WHERE tenant_id = :gym AND sellado_at IS NULL AND import_id IS NULL AND fecha < :piso
                        """)
                .setParameter("ahora", ahora).setParameter("gym", gym).setParameter("piso", piso)
                .executeUpdate();
        return cobros + movimientos;
    }

    private static List<List<UUID>> tandas(List<UUID> ids) {
        List<List<UUID>> out = new ArrayList<>();
        for (int i = 0; i < ids.size(); i += DE_A) {
            out.add(ids.subList(i, Math.min(ids.size(), i + DE_A)));
        }
        return out;
    }

    private static LocalDateTime fecha(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return (LocalDateTime) o;
    }
}
