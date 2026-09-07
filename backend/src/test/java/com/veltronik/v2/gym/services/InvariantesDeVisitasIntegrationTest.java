package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * LAS REGLAS QUE NUNCA SE PUEDEN VIOLAR, probadas TODAS JUNTAS después de cada escenario.
 *
 * <p><b>Por qué existe este archivo.</b> Trabajar sin internet significa que los hechos llegan
 * <i>tarde y desordenados</i>, y el sistema fue escrito asumiendo que el momento en que algo
 * llega es el momento en que pasó. De esa única suposición salieron tres bugs distintos, uno
 * atrás del otro, y los tres los encontró el dueño mirando la pantalla con los tests en verde:</p>
 *
 * <ul>
 *   <li>una visita con la <b>salida antes que la entrada</b>, y tiempo promedio negativo;</li>
 *   <li>lo mismo otra vez, ahora del lado del servidor;</li>
 *   <li>el socio <b>adentro dos veces</b> en la lista de quién está en el gimnasio.</li>
 * </ul>
 *
 * <p>Cada uno se arregló solo, con su test, y el siguiente apareció igual. El problema del
 * método era ese: se probaba <b>lo que ya había entendido</b>, de a un caso por vez. Acá se da
 * vuelta — se escriben las reglas que tienen que valer <i>siempre</i>, y cada escenario las
 * verifica <b>todas</b>, así un arreglo que rompe otra regla no puede pasar.</p>
 *
 * <p><b>Contra Postgres de verdad, y no es un lujo.</b> Los tres bugs fueron <i>qué consulta se
 * usa</i>, no qué hace el servicio con la respuesta. Con repositorios simulados el test dice
 * exactamente lo que yo creía que la consulta devolvía, que es precisamente lo que estaba mal.</p>
 *
 * <p>Se corre esto antes de la fase 3 a propósito: ahí lo que llega tarde es <b>plata</b>, y la
 * misma familia de error aplicada a un cobro no es un socio duplicado en una lista — es una
 * venta cobrada dos veces.</p>
 */
@Transactional
class InvariantesDeVisitasIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private AccessLogService accessLogService;

    private UUID gym;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio de las reglas', true)
                """).setParameter("id", gym).executeUpdate();

        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :gym, 'Socio', 'De Prueba', :email, :doc, true, :vence, now(), now())
                """)
                .setParameter("id", socio)
                .setParameter("gym", gym)
                .setParameter("email", socio + "@test.com")
                .setParameter("doc", socio.toString().substring(0, 8))
                .setParameter("vence", LocalDateTime.now().plusDays(30))
                .executeUpdate();

        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAS REGLAS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Las cuatro reglas de estado, verificadas contra lo que quedó EN LA BASE.
     *
     * <p>Se llama al final de todos los escenarios, siempre. Ese es el punto: un arreglo que
     * respeta la regla que vino a arreglar pero rompe otra tiene que dar rojo acá.</p>
     */
    @SuppressWarnings("unchecked")
    private void reglas(String escenario) {
        em.flush();

        List<Object[]> filas = em.createNativeQuery("""
                SELECT check_in_at, check_out_at, auto_closed
                FROM access_log
                WHERE tenant_id = :gym AND member_id = :socio
                ORDER BY check_in_at
                """)
                .setParameter("gym", gym)
                .setParameter("socio", socio)
                .getResultList();

        int abiertas = 0;
        for (Object[] f : filas) {
            LocalDateTime entrada = ((java.sql.Timestamp) f[0]).toLocalDateTime();
            LocalDateTime salida = f[1] == null ? null : ((java.sql.Timestamp) f[1]).toLocalDateTime();
            boolean autoCerrada = (Boolean) f[2];

            // ── REGLA 1 ──
            if (salida != null) {
                assertTrue(!salida.isBefore(entrada),
                        escenario + ": REGLA 1 — nadie sale antes de haber entrado. "
                                + "entrada=" + entrada + " salida=" + salida);
            } else {
                abiertas++;
            }

            // ── REGLA 4 ──
            // Solo se exige a las que cerró el sistema: una visita real puede cruzar la
            // medianoche (el gimnasio abierto hasta tarde), pero una ESTIMADA no, porque
            // entonces graba visitas de 25 horas que cualquier consulta lee como reales.
            if (autoCerrada && salida != null) {
                assertEquals(entrada.toLocalDate(), salida.toLocalDate(),
                        escenario + ": REGLA 4 — una visita que cerró el sistema no cruza la "
                                + "medianoche. entrada=" + entrada + " salida=" + salida);
            }
        }

        // ── REGLA 2 ──
        assertTrue(abiertas <= 1,
                escenario + ": REGLA 2 — nadie está adentro dos veces. abiertas=" + abiertas);
    }

    /** Cuántas visitas tiene el socio. Las reglas 3 y 5 se miden con esto. */
    private long visitas() {
        em.flush();
        Object n = em.createNativeQuery("""
                SELECT COUNT(*) FROM access_log WHERE tenant_id = :gym AND member_id = :socio
                """)
                .setParameter("gym", gym)
                .setParameter("socio", socio)
                .getSingleResult();
        return n instanceof BigInteger b ? b.longValue() : ((Number) n).longValue();
    }

    /** Un acceso del mostrador: con su sello y con el momento en que PASÓ. */
    private AccessLogService.ScanResult acceso(LocalDateTime cuando, UUID sello) {
        return accessLogService.registerScan(socio, "manual", null, null, sello, cuando);
    }

    private AccessLogService.ScanResult acceso(LocalDateTime cuando) {
        return acceso(cuando, UUID.randomUUID());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOS ESCENARIOS
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("el día normal: entra y sale, en orden")
    void diaNormal() {
        LocalDateTime ahora = LocalDateTime.now();
        acceso(ahora.minusMinutes(60));
        acceso(ahora.minusMinutes(10));

        reglas("día normal");
        assertEquals(1, visitas(), "entrada y salida son UNA visita, no dos");
    }

    @Test
    @DisplayName("⭐ el acceso atrasado que llega después de uno nuevo")
    void accesoAtrasado() {
        // El caso que rompió dos veces. El mostrador estaba sin internet a las 09:17 y ese
        // acceso quedó en la cola; a las 10:01 se registró otro con la conexión de vuelta.
        LocalDateTime ahora = LocalDateTime.now();
        acceso(ahora.minusMinutes(20));   // el nuevo llega primero
        acceso(ahora.minusMinutes(65));   // el viejo, después

        reglas("acceso atrasado");
    }

    @Test
    @DisplayName("⭐⭐ el orden de llegada NO cambia el resultado")
    void elOrdenDeLlegadaNoImporta() {
        // LA REGLA 5, Y LA MÁS DURA. El socio entró 09:00, salió 10:00 y volvió 11:00: son DOS
        // visitas, se cuenten cuando se cuenten.
        //
        // Y esto pasa de verdad: el mostrador tiene 09:00 y 10:00 encolados sin internet
        // mientras el socio marca 11:00 por QR desde su CELULAR, que tiene conexión propia. El
        // 11:00 llega primero. Si el número de visitas depende de eso, "¿vino este socio este
        // mes?" contesta distinto según cómo estuvo el wifi — y ese es el número con el que el
        // dueño decide a quién llamar.
        LocalDateTime hoy = LocalDate.now().atTime(9, 0);

        acceso(hoy.plusHours(2));   // 11:00 — por QR, llega primero
        acceso(hoy);                // 09:00 — de la cola
        acceso(hoy.plusHours(1));   // 10:00 — de la cola

        reglas("llegada desordenada");
        assertEquals(2, visitas(),
                "entró 09:00, salió 10:00, volvió 11:00: son DOS visitas llegue como llegue");
    }

    @Test
    @DisplayName("el reintento del mismo sello no duplica ni invierte")
    void reintentoDelMismoSello() {
        // Sin esto, un reintento no duplica: INVIERTE. La dirección se deduce del estado, así
        // que procesarlo de nuevo daría salida donde hubo entrada y el socio quedaría "afuera"
        // sin haberse ido.
        LocalDateTime ahora = LocalDateTime.now().minusMinutes(30);
        UUID sello = UUID.randomUUID();

        var primera = acceso(ahora, sello);
        var segunda = acceso(ahora, sello);
        var tercera = acceso(ahora, sello);

        assertEquals(primera.direction(), segunda.direction(), "el reintento no invierte");
        assertEquals(primera.direction(), tercera.direction(), "ni el tercero");
        assertEquals(1, visitas(), "REGLA 3 — tres veces el mismo sello es UNA visita");
        reglas("reintento");
    }

    @Test
    @DisplayName("el reintento de una SALIDA tampoco reabre la visita")
    void reintentoDeUnaSalida() {
        LocalDateTime ahora = LocalDateTime.now();
        acceso(ahora.minusMinutes(60));

        UUID selloSalida = UUID.randomUUID();
        acceso(ahora.minusMinutes(5), selloSalida);
        acceso(ahora.minusMinutes(5), selloSalida);   // el reintento

        assertEquals(1, visitas(), "el reintento de la salida no abre una visita nueva");
        reglas("reintento de salida");
    }

    @Test
    @DisplayName("la visita que quedó abierta de anoche no cruza la medianoche")
    void visitaDeAnoche() {
        // Fechas de calendario explícitas: con horas relativas a now() este test se cae solo
        // en la madrugada, cuando "hace 20 horas" sigue siendo hoy.
        LocalDateTime anoche = LocalDate.now().minusDays(1).atTime(23, 50);
        LocalDateTime madrugada = LocalDate.now().atTime(0, 30);

        acceso(madrugada);   // llega primero
        acceso(anoche);      // el de anoche, atrasado

        reglas("visita de anoche");
    }

    @Test
    @DisplayName("se fue sin marcar: la visita vieja se cierra y la nueva no hereda nada")
    void seFueSinMarcar() {
        LocalDateTime ahora = LocalDateTime.now();
        acceso(ahora.minusHours(9));   // más viejo que el máximo de visita (6 h)
        acceso(ahora.minusMinutes(5));

        reglas("se fue sin marcar");
        assertEquals(2, visitas(), "la de ayer se cierra sola y la de hoy es una visita nueva");
    }
}
