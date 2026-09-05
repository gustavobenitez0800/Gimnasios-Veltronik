package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.hibernate.Session;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Cuántas veces va el mostrador a la base para pintar una pantalla.
 *
 * <p><b>El problema.</b> {@code AccessLog.member} es {@code EAGER}, y en una consulta
 * derivada eso NO se traduce en un join: Hibernate trae los accesos con una consulta y
 * después pide el socio de cada uno por separado. Con 200 accesos en el día son 200 viajes
 * de ida y vuelta entre Railway y Supabase, y el mostrador hace TRES de estas consultas
 * cada quince segundos.</p>
 *
 * <p>Por eso el gimnasio veía la pantalla colgada y en la máquina de desarrollo andaba
 * bien: acá la base está al lado y casi sin datos. El costo crece con las horas del día —
 * a las 9 de la mañana anda, a las 8 de la noche no.</p>
 *
 * <p>Este test cuenta consultas, no mide tiempo: un test de tiempo pasa o falla según la
 * máquina que lo corra, y lo que hay que impedir es que vuelva a crecer con los datos.</p>
 */
class MostradorConsultasTest extends EmbeddedPostgresTest {

    private static final int CUANTOS_SOCIOS = 12;

    @Autowired
    private EntityManager em;

    @Autowired
    private AccessLogService accessLogService;

    private UUID gym;

    private Statistics stats() {
        return em.unwrap(Session.class).getSessionFactory().getStatistics();
    }

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio N+1', true)
                """).setParameter("id", gym).executeUpdate();

        for (int i = 0; i < CUANTOS_SOCIOS; i++) {
            UUID socio = UUID.randomUUID();
            em.createNativeQuery("""
                    INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                             is_active, membership_end, created_at, updated_at)
                    VALUES (:id, :tenant, :nombre, 'Prueba', :email, :doc, true, :vence, now(), now())
                    """)
                    .setParameter("id", socio)
                    .setParameter("tenant", gym)
                    .setParameter("nombre", "Socio" + i)
                    .setParameter("email", socio + "@test.com")
                    .setParameter("doc", "90" + String.format("%06d", i) + (int) (Math.random() * 9))
                    .setParameter("vence", LocalDateTime.now().plusDays(20))
                    .executeUpdate();

            /*
             * ⚠️ "HACE UNA HORA" NO SIEMPRE ES HOY.
             *
             * Acá decía `LocalDateTime.now().minusHours(1)`, y a las 00:20 eso cae en el
             * día ANTERIOR. `getTodayAccesses()` filtra por día CALENDARIO —de 00:00 a
             * 23:59—, así que no encontraba ninguna de las 12 marcas y el test fallaba con
             * "expected: <12> but was: <0>".
             *
             * O sea: este test se rompía TODAS las noches, entre las 00:00 y las 00:59, sin
             * que nadie tocara nada. Lo agarró un CI que corrió 00:20 hora argentina.
             *
             * Se toma el más tardío entre "hace una hora" y el arranque de hoy: durante el
             * día la marca queda realista, y de madrugada queda pegada al inicio del día —
             * siempre dentro de la ventana que la consulta va a mirar.
             */
            LocalDateTime haceUnaHora = LocalDateTime.now().minusHours(1);
            LocalDateTime arranqueDeHoy = LocalDate.now().atStartOfDay();
            LocalDateTime cuando = haceUnaHora.isBefore(arranqueDeHoy) ? arranqueDeHoy : haceUnaHora;

            // Una visita abierta hoy: cuenta para "adentro" y para "el registro de hoy".
            em.createNativeQuery("""
                    INSERT INTO access_log (id, tenant_id, member_id, check_in_at, access_method, created_at, updated_at)
                    VALUES (:id, :tenant, :socio, :cuando, 'MANUAL', now(), now())
                    """)
                    .setParameter("id", UUID.randomUUID())
                    .setParameter("tenant", gym)
                    .setParameter("socio", socio)
                    .setParameter("cuando", cuando)
                    .executeUpdate();
        }
        em.flush();
        em.clear();
        TenantContextHolder.setTenantId(gym);
        stats().setStatisticsEnabled(true);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /**
     * El techo. Con el join son 1 o 2 consultas; sin él, una por socio y sigue creciendo.
     * Se deja holgado a propósito: lo que importa no es el número exacto sino que NO
     * dependa de cuántos socios haya.
     */
    private static final int TECHO = 4;

    @Test
    @Transactional
    @DisplayName("'quién está adentro' no pide el socio de a uno")
    void adentroEnUnaConsulta() {
        em.clear();
        stats().clear();

        var lista = accessLogService.getActiveAccesses();
        // Se tocan los nombres a propósito: si vinieran perezosos, el costo aparecería acá.
        lista.forEach(a -> assertNotNull(a.getMember().getFirstName()));

        long consultas = stats().getPrepareStatementCount();
        assertEquals(CUANTOS_SOCIOS, lista.size(), "la siembra tiene que estar completa");
        assertTrue(consultas <= TECHO,
                "una consulta por socio: " + consultas + " viajes a la base para " + CUANTOS_SOCIOS
                        + " accesos. Con 200 accesos en un día son 200 viajes, cada 15 segundos.");
    }

    @Test
    @Transactional
    @DisplayName("'el registro de hoy' tampoco")
    void hoyEnUnaConsulta() {
        em.clear();
        stats().clear();

        var lista = accessLogService.getTodayAccesses();
        lista.forEach(a -> assertNotNull(a.getMember().getFirstName()));

        long consultas = stats().getPrepareStatementCount();
        assertEquals(CUANTOS_SOCIOS, lista.size());
        assertTrue(consultas <= TECHO,
                "una consulta por socio: " + consultas + " viajes para " + CUANTOS_SOCIOS + " accesos");
    }
}
