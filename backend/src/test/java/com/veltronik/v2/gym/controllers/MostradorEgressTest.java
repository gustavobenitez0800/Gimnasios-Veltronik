package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.security.MemberAccessPolicy;
import com.veltronik.v2.gym.services.AccessLogService;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 🔴 LO QUE EL MOSTRADOR SACA DE LA BASE.
 *
 * <p><b>Qué pasó.</b> El 30/09/2026 Supabase marcó 5,48 GB de tráfico de salida sobre los 5 GB
 * del plan, a los doce días del ciclo: ~750 MB por día hábil, de UN solo gimnasio. Supabase
 * cobra lo que sale de la base hacia el servidor —no lo que llega a la pantalla—, y el
 * mostrador, que cada terminal pide cada quince segundos, traía en cada pedido el día entero
 * con la ficha de cada socio, dos veces (el registro y los avisos), para mandar 60 filas.</p>
 *
 * <p>Estos tests cuentan <b>fichas cargadas desde la base</b> ({@code getEntityLoadCount}),
 * no tiempo ni bytes: lo que hay que impedir es que lo que sale de la base vuelva a crecer
 * con los datos del día o con la cantidad de pedidos.</p>
 *
 * <p>⚠️ Llaman al CONTROLADOR sin {@code @Transactional}, como en producción, y siembran en
 * transacciones propias que commitean: la foto del mostrador vive entre pedidos, y una
 * transacción de test abierta de punta a punta no dejaría ver eso.</p>
 */
class MostradorEgressTest extends EmbeddedPostgresTest {

    private static final ZoneId ZONA = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired private EntityManager em;
    @Autowired private EntityManagerFactory emf;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired private GymAccessController controller;
    @Autowired private AccessLogService accessService;
    @Autowired private GymMemberRepository memberRepository;
    @Autowired private MemberAccessPolicy policy;

    private TransactionTemplate tx;
    private final List<UUID> gimnasios = new ArrayList<>();
    private UUID gym;
    private long ahoraFalso;

    @BeforeEach
    void preparar() {
        tx = new TransactionTemplate(txManager);
        gym = crearGimnasio();
        TenantContextHolder.setTenantId(gym);
        ahoraFalso = System.currentTimeMillis();
        elDeVerdad().reloj = () -> ahoraFalso;
        stats().setStatisticsEnabled(true);
    }

    /**
     * El reloj se le cambia al controlador de ADENTRO: si algún día lleva un
     * {@code @PreAuthorize}, Spring lo envuelve en un proxy y un campo escrito en el proxy no lo
     * ve nadie (ya pasó en {@code ListaDeSociosEgressTest}).
     */
    private GymAccessController elDeVerdad() {
        return org.springframework.test.util.AopTestUtils.getUltimateTargetObject(controller);
    }

    @AfterEach
    void limpiar() {
        elDeVerdad().reloj = System::currentTimeMillis;
        TenantContextHolder.clear();
        tx.executeWithoutResult(st -> {
            for (UUID t : gimnasios) {
                em.createNativeQuery("DELETE FROM access_log WHERE tenant_id = :t").setParameter("t", t).executeUpdate();
                em.createNativeQuery("DELETE FROM gym_member WHERE tenant_id = :t").setParameter("t", t).executeUpdate();
                em.createNativeQuery("DELETE FROM tenant WHERE id = :t").setParameter("t", t).executeUpdate();
            }
        });
        gimnasios.clear();
    }

    // ─── Siembra ────────────────────────────────────────────────────────────────

    private Statistics stats() {
        return emf.unwrap(SessionFactory.class).getStatistics();
    }

    private UUID crearGimnasio() {
        UUID id = UUID.randomUUID();
        gimnasios.add(id);
        tx.executeWithoutResult(st -> em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio de prueba', true)
                """).setParameter("id", id).executeUpdate());
        return id;
    }

    /** @param vence null = socio sin fecha de vencimiento (migrado a las apuradas). */
    private UUID crearSocio(UUID tenant, String nombre, boolean activo, LocalDateTime vence) {
        UUID id = UUID.randomUUID();
        tx.executeWithoutResult(st -> em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, :n, 'Prueba', :mail, :doc, :activo, :vence, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant).setParameter("n", nombre)
                .setParameter("mail", id + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("activo", activo)
                .setParameter("vence", vence)
                .executeUpdate());
        return id;
    }

    /**
     * Una marca de HOY, en hora argentina. Se toma el más tardío entre "hace un rato" y el
     * arranque del día: a las 00:20 "hace una hora" es ayer, y el test se rompería de noche
     * (ya pasó, ver MostradorConsultasTest).
     */
    private void marcar(UUID tenant, UUID socio, String metodo, int haceMinutos) {
        LocalDateTime ahora = LocalDateTime.now(ZONA);
        LocalDateTime arranque = LocalDate.now(ZONA).atStartOfDay().plusSeconds(1);
        LocalDateTime cuando = ahora.minusMinutes(haceMinutos);
        LocalDateTime marca = cuando.isBefore(arranque) ? arranque : cuando;
        tx.executeWithoutResult(st -> em.createNativeQuery("""
                INSERT INTO access_log (id, tenant_id, member_id, check_in_at, access_method, created_at, updated_at)
                VALUES (:id, :t, :s, :cuando, :metodo, now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", tenant)
                .setParameter("s", socio).setParameter("cuando", marca)
                .setParameter("metodo", metodo)
                .executeUpdate());
    }

    private LocalDateTime enDias(int dias) {
        return LocalDateTime.now(ZONA).plusDays(dias);
    }

    private Map<String, Object> pedirMostrador() {
        return controller.mostrador().getBody();
    }

    /** Doce socios al día que entraron a mano: un día de gimnasio en miniatura. */
    private void unDiaConDoceEntradas() {
        for (int i = 0; i < 12; i++) {
            UUID socio = crearSocio(gym, "Socio" + i, true, enDias(20));
            marcar(gym, socio, "MANUAL", 60 - i);
        }
    }

    // ─── La foto ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐ si en la puerta no pasó nada, el segundo pedido no trae ni una ficha de la base")
    void laFotoNoVuelveALaBase() {
        unDiaConDoceEntradas();
        Map<String, Object> primero = pedirMostrador();

        stats().clear();
        Map<String, Object> segundo = pedirMostrador();

        assertEquals(0, stats().getEntityLoadCount(),
                "el mostrador se rearmó sin que cambiara nada: cada terminal lo pide cada 15 s");
        assertTrue(stats().getPrepareStatementCount() <= 3,
                "solo las tres marcas: " + stats().getPrepareStatementCount() + " consultas");
        assertEquals(primero, segundo);
    }

    @Test
    @DisplayName("una entrada nueva rehace la foto en el acto")
    void unaEntradaRehaceLaFoto() {
        unDiaConDoceEntradas();
        // El socio se crea ANTES: así lo único que cambia entre los dos pedidos es la puerta.
        UUID llega = crearSocio(gym, "Llega", true, enDias(20));
        assertEquals(12, pedirMostrador().get("hoyTotal"));

        marcar(gym, llega, "MANUAL", 0);

        assertEquals(13, pedirMostrador().get("hoyTotal"));
    }

    @Test
    @DisplayName("un cobro rehace la foto aunque en la puerta no haya pasado nada")
    void unCobroRehaceLaFoto() {
        UUID moroso = crearSocio(gym, "Moroso", true, enDias(-10));
        marcar(gym, moroso, "QR", 5);
        assertEquals(1, ((List<?>) pedirMostrador().get("avisos")).size(),
                "entró vencido por QR: la recepcionista tiene que enterarse");

        // Pagó: el cobro corre el vencimiento de la ficha (y su updated_at, como hace JPA).
        tx.executeWithoutResult(st -> em.createNativeQuery("""
                UPDATE gym_member SET membership_end = :vence, updated_at = now() + interval '1 second'
                WHERE id = :id
                """).setParameter("vence", enDias(30)).setParameter("id", moroso).executeUpdate());

        assertEquals(0, ((List<?>) pedirMostrador().get("avisos")).size(),
                "ya pagó: un aviso congelado la mandaría a reclamarle a alguien que está al día");
    }

    @Test
    @DisplayName("aun sin cambios, la foto vence al minuto")
    void laFotoVence() {
        unDiaConDoceEntradas();
        pedirMostrador();

        ahoraFalso += GymAccessController.FOTO_VIGENTE_MS + 1;
        stats().clear();
        pedirMostrador();

        assertTrue(stats().getEntityLoadCount() > 0,
                "pasado el minuto tiene que rearmarse: hay cosas que cambian solas con el reloj");
    }

    @Test
    @DisplayName("🔴 cada gimnasio ve SU mostrador, nunca la foto de otro")
    void cadaGimnasioSuFoto() {
        marcar(gym, crearSocio(gym, "DelPrimero", true, enDias(20)), "MANUAL", 10);
        pedirMostrador();

        UUID otro = crearGimnasio();
        TenantContextHolder.setTenantId(otro);
        Map<String, Object> delOtro = pedirMostrador();

        assertEquals(0, delOtro.get("hoyTotal"));
        assertEquals(0, ((List<?>) delOtro.get("adentro")).size());
    }

    // ─── Lo que se trae cuando sí hay que armarlo ───────────────────────────────

    @Test
    @DisplayName("el registro de hoy trae de la base solo las filas que viajan")
    void elRegistroTraeSoloLoQueViaja() {
        unDiaConDoceEntradas();

        stats().clear();
        var ultimos = accessService.ultimosDeHoy(5);
        assertEquals(5, ultimos.size());
        assertTrue(stats().getEntityLoadCount() <= 10,
                "5 accesos y sus 5 socios, no el día entero: " + stats().getEntityLoadCount() + " fichas");
    }

    @Test
    @DisplayName("el total y el promedio del día salen sin traer una sola ficha")
    void elResumenNoTraeFichas() {
        unDiaConDoceEntradas();

        stats().clear();
        assertEquals(12, accessService.resumenDeHoy().total());
        assertEquals(0, stats().getEntityLoadCount());
    }

    @Test
    @DisplayName("⭐ los avisos traen solo a los que no están al día, y coinciden con la política")
    void losAvisosCoincidenConLaPolitica() {
        // Una persona en cada situación posible, todas entraron hoy por QR.
        List<UUID> socios = List.of(
                crearSocio(gym, "AlDia", true, enDias(10)),
                crearSocio(gym, "EnGracia", true, enDias(-1)),
                crearSocio(gym, "Vencido", true, enDias(-10)),
                crearSocio(gym, "SinDatos", true, null),
                crearSocio(gym, "DadoDeBaja", false, enDias(10)));
        for (UUID s : socios) marcar(gym, s, "QR", 5);
        // Y diez más al día: son el grueso de un día real y los que ya no deben viajar.
        for (int i = 0; i < 10; i++) marcar(gym, crearSocio(gym, "AlDia" + i, true, enDias(15)), "QR", 5);

        stats().clear();
        Set<UUID> conAviso = accessService.avisosPendientes().stream()
                .map(AccessLogService.Aviso::socioId).collect(Collectors.toSet());
        long fichas = stats().getEntityLoadCount();

        // La política decide sola, ficha por ficha, sin la consulta de por medio.
        LocalDateTime ahora = LocalDateTime.now(ZONA);
        Set<UUID> segunLaPolitica = socios.stream()
                .filter(s -> policy.evaluate(memberRepository.findById(s).orElseThrow(), ahora).necesitaAviso())
                .collect(Collectors.toSet());

        assertEquals(4, segunLaPolitica.size(), "la siembra tiene que cubrir las cuatro situaciones con aviso");
        assertEquals(segunLaPolitica, conAviso,
                "el filtro de la consulta se desfasó de MemberAccessPolicy.necesitaAviso");
        assertTrue(fichas <= 8,
                "4 accesos y sus 4 socios; los 11 al día no tienen que salir de la base: " + fichas + " fichas");
        assertNotEquals(0, fichas);
    }
}
