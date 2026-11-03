package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El flujo del molinete de punta a punta y contra Postgres, con los avisos REALES que mandó el
 * equipo el 2026-09-03.
 *
 * <p><b>Por qué con datos reales.</b> El comportamiento que rompe esto no se adivina leyendo la
 * documentación del fabricante: el equipo avisa por <i>reconocimiento</i>, no por persona, y
 * manda una ráfaga mientras haya una cara enfrente. Los tiempos de abajo son los que mandó de
 * verdad —seis avisos en dieciséis segundos de alguien parado frente a la cámara— y la ráfaga
 * tiene que terminar siendo UNA visita.</p>
 *
 * <p>Los milisegundos van relativos a {@code now()} y no fijos: {@code registerScan} desconfía
 * de los relojes viejos y acota todo lo anterior a 36 horas, así que un timestamp absoluto
 * haría pasar este test hoy y fallar la semana que viene, que es la peor clase de test.</p>
 */
class MolineteFlowIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private MolineteService molineteService;

    private static final String SERIE = "E03C1CB7BBE61830";

    /** La cadencia real de la ráfaga: milisegundos entre el primer aviso y cada uno de los otros. */
    private static final long[] RAFAGA_REAL = {0, 2086, 6650, 8742, 10848, 15919};

    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @Transactional
    @DisplayName("el socio al día pasa y queda su visita, una sola vez pese a la ráfaga")
    void laRafagaEsUnaSolaVisita() {
        UUID gym = crearGimnasio("Gimnasio del Molinete");
        UUID socio = crearSocio(gym, "Juan", LocalDateTime.now().plusDays(20));
        String token = crearPuerta(gym);
        em.flush();

        long base = System.currentTimeMillis() - 60_000;
        for (long offset : RAFAGA_REAL) {
            molineteService.recibir(token, aviso(socio, "face_0", base + offset, "1"));
        }
        em.flush();

        assertEquals(1, visitasDe(socio), "seis avisos del equipo son una persona entrando una vez");
        assertEquals("FACIAL", metodoDe(socio));
        assertEquals(0, rechazosDe(socio));
    }

    @Test
    @Transactional
    @DisplayName("la puerta se aparea sola con el equipo que avisa primero")
    void apareaLaPuerta() {
        UUID gym = crearGimnasio("Gimnasio Apareo");
        UUID socio = crearSocio(gym, "Ana", LocalDateTime.now().plusDays(20));
        String token = crearPuerta(gym);
        em.flush();

        molineteService.recibir(token, aviso(socio, "face_0", System.currentTimeMillis(), "1"));
        em.flush();

        assertEquals(SERIE, em.createNativeQuery(
                        "SELECT device_serial FROM checkin_point WHERE token = :t")
                .setParameter("t", token).getSingleResult());
    }

    @Test
    @Transactional
    @DisplayName("otro equipo con el token de esta puerta no registra nada")
    void otroEquipoNoEntra() {
        UUID gym = crearGimnasio("Gimnasio Ajeno");
        UUID socio = crearSocio(gym, "Pedro", LocalDateTime.now().plusDays(20));
        String token = crearPuerta(gym);
        em.flush();

        molineteService.recibir(token, aviso(socio, "face_0", System.currentTimeMillis(), "1"));
        em.flush();

        var r = molineteService.recibir(token, new MolineteService.Aviso(
                enElEquipo(socio), "0000000000000000", "face_0",
                String.valueOf(System.currentTimeMillis()), "1"));
        em.flush();

        assertEquals(MolineteService.Resultado.NO_AUTORIZADO, r);
        assertEquals(1, visitasDe(socio), "la visita que quedó es la del equipo legítimo");
    }

    /**
     * El equipo guarda lo que no pudo entregar y lo reenvía. Si el reenvío no se reconociera,
     * la segunda vez saldría SALIDA donde hubo ENTRADA: la dirección se deduce del estado.
     */
    @Test
    @Transactional
    @DisplayName("el aviso reenviado después de un corte no duplica ni invierte la visita")
    void elReenvioNoDuplica() {
        UUID gym = crearGimnasio("Gimnasio Sin Internet");
        UUID socio = crearSocio(gym, "Lucía", LocalDateTime.now().plusDays(20));
        String token = crearPuerta(gym);
        em.flush();

        long momento = System.currentTimeMillis() - 3_600_000;   // hace una hora
        molineteService.recibir(token, aviso(socio, "face_0", momento, "1"));
        molineteService.recibir(token, aviso(socio, "face_0", momento, "1"));
        em.flush();

        assertEquals(1, visitasDe(socio));
        assertNull(salidaDe(socio), "el reenvío no puede cerrar la visita que él mismo abrió");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El vencido
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @Transactional
    @DisplayName("al vencido lo frena el equipo: queda anotado con nombre y NO cuenta como visita")
    void elVencidoQuedaAnotadoPeroNoEntra() {
        UUID gym = crearGimnasio("Gimnasio del Vencido");
        UUID socio = crearSocio(gym, "Carlos", LocalDateTime.now().minusDays(40));
        String token = crearPuerta(gym);
        em.flush();

        long base = System.currentTimeMillis() - 60_000;
        for (long offset : RAFAGA_REAL) {
            molineteService.recibir(token, aviso(socio, "face_1", base + offset, "2"));
        }
        em.flush();

        assertEquals(0, visitasDe(socio), "no entró: no puede contar como asistencia");
        assertEquals(1, rechazosDe(socio), "el forcejeo entero es una sola línea para llamarlo");
        assertEquals("FUERA_DE_HORARIO", motivoDe(socio));
    }

    @Test
    @Transactional
    @DisplayName("un desconocido frente a la cámara no deja rastro")
    void elDesconocidoNoDejaRastro() {
        UUID gym = crearGimnasio("Gimnasio Desconocido");
        String token = crearPuerta(gym);
        em.flush();

        var r = molineteService.recibir(token, new MolineteService.Aviso(
                "STRANGERBABY", SERIE, "face_2", String.valueOf(System.currentTimeMillis()), "3"));
        em.flush();

        assertEquals(MolineteService.Resultado.DESCONOCIDO, r);
        assertEquals(0L, ((Number) em.createNativeQuery(
                "SELECT count(*) FROM access_denied WHERE tenant_id = :t")
                .setParameter("t", gym).getSingleResult()).longValue());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El mostrador frena (la cajita del molinete, con el llavero)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @Transactional
    @DisplayName("⭐ el mostrador frena al vencido del llavero: queda en la lista de frenados, NO como visita, y una sola vez")
    void elMostradorFrenaAlVencido() {
        UUID gym = crearGimnasio("Gimnasio de la Cajita");
        UUID delLlavero = crearSocio(gym, "Lucía", LocalDateTime.now().minusDays(12));
        UUID deLaCara = crearSocio(gym, "Carlos", LocalDateTime.now().minusDays(40));
        String token = crearPuerta(gym);
        em.flush();
        // El molinete facial también frena a uno: los dos tienen que convivir en la misma lista.
        molineteService.recibir(token, aviso(deLaCara, "face_1", System.currentTimeMillis(), "2"));

        TenantContextHolder.setTenantId(gym);
        try {
            assertEquals(MolineteService.Resultado.RECHAZADO,
                    molineteService.anotarRechazoDelMostrador(delLlavero, "LLAVERO"));
            assertEquals(MolineteService.Resultado.REPETIDO,
                    molineteService.anotarRechazoDelMostrador(delLlavero, "LLAVERO"),
                    "el que se queda pasando el llavero es una sola línea, como con la cara");
            em.flush();

            assertEquals(0, visitasDe(delLlavero), "no entró: no puede figurar adentro (era el agujero)");
            assertEquals(1, rechazosDe(delLlavero));
            assertEquals("NO_ESTA_AL_DIA", motivoDe(delLlavero));

            var lista = molineteService.rechazosPendientes();
            assertEquals(2, lista.size());
            var delMostrador = lista.stream().filter(r -> r.socioId().equals(delLlavero)).findFirst().orElseThrow();
            var delEquipo = lista.stream().filter(r -> r.socioId().equals(deLaCara)).findFirst().orElseThrow();
            assertEquals("VENCIDO", delMostrador.estado());
            assertTrue(delMostrador.delMostrador(), "al cobrarle, el mostrador sabe que la puerta la maneja él");
            assertFalse(delEquipo.delMostrador(), "al de la cara lo vuelve a dejar pasar el equipo, no la PC");
        } finally {
            TenantContextHolder.clear();
        }
    }

    @Test
    @Transactional
    @DisplayName("el mostrador no puede anotar como frenado a un socio de otro gimnasio")
    void elMostradorNoAnotaAjenos() {
        UUID gym = crearGimnasio("Gimnasio Uno");
        UUID otro = crearGimnasio("Gimnasio Dos");
        UUID ajeno = crearSocio(otro, "Ajeno", LocalDateTime.now().minusDays(5));
        em.flush();

        TenantContextHolder.setTenantId(gym);
        try {
            assertEquals(MolineteService.Resultado.SOCIO_INEXISTENTE,
                    molineteService.anotarRechazoDelMostrador(ajeno, "LLAVERO"));
            assertEquals(MolineteService.Resultado.SOCIO_INEXISTENTE,
                    molineteService.anotarRechazoDelMostrador(null, "LLAVERO"));
            em.flush();
            assertEquals(0, rechazosDe(ajeno));
        } finally {
            TenantContextHolder.clear();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Siembra y consultas
    // ─────────────────────────────────────────────────────────────────────────

    private static MolineteService.Aviso aviso(UUID socio, String tipo, long ms, String passTime) {
        return new MolineteService.Aviso(enElEquipo(socio), SERIE, tipo, String.valueOf(ms), passTime);
    }

    /** Cómo viaja el id del socio adentro del equipo: sin guiones, que es lo único que acepta. */
    private static String enElEquipo(UUID socio) {
        return socio.toString().replace("-", "");
    }

    private UUID crearGimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :nombre, true)
                """).setParameter("id", id).setParameter("nombre", nombre + " " + id).executeUpdate();
        return id;
    }

    private UUID crearSocio(UUID tenant, String nombre, LocalDateTime vence) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :tenant, :nombre, 'Molinete', :email, :doc, true, :vence, now(), now())
                """)
                .setParameter("id", id)
                .setParameter("tenant", tenant)
                .setParameter("nombre", nombre)
                .setParameter("email", id + "@test.com")
                .setParameter("doc", String.valueOf(Math.abs(id.getLeastSignificantBits() % 100000000)))
                .setParameter("vence", vence)
                .executeUpdate();
        return id;
    }

    private String crearPuerta(UUID tenant) {
        String token = "tok-" + UUID.randomUUID().toString().replace("-", "");
        em.createNativeQuery("""
                INSERT INTO checkin_point (id, created_at, updated_at, tenant_id, token, name, is_active)
                VALUES (:id, now(), now(), :tenant, :token, 'Molinete', true)
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("tenant", tenant)
                .setParameter("token", token)
                .executeUpdate();
        return token;
    }

    private int visitasDe(UUID socio) {
        return ((Number) em.createNativeQuery(
                "SELECT count(*) FROM access_log WHERE member_id = :m")
                .setParameter("m", socio).getSingleResult()).intValue();
    }

    private String metodoDe(UUID socio) {
        return (String) em.createNativeQuery(
                "SELECT access_method FROM access_log WHERE member_id = :m")
                .setParameter("m", socio).getSingleResult();
    }

    private Object salidaDe(UUID socio) {
        return em.createNativeQuery("SELECT check_out_at FROM access_log WHERE member_id = :m")
                .setParameter("m", socio).getSingleResult();
    }

    private int rechazosDe(UUID socio) {
        return ((Number) em.createNativeQuery(
                "SELECT count(*) FROM access_denied WHERE member_id = :m")
                .setParameter("m", socio).getSingleResult()).intValue();
    }

    private String motivoDe(UUID socio) {
        return (String) em.createNativeQuery(
                "SELECT reason FROM access_denied WHERE member_id = :m")
                .setParameter("m", socio).getSingleResult();
    }
}
