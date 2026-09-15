package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ⭐ EL CIERRE DE CAJA HECHO SIN INTERNET (Fase 3, paso 6 — el último).
 *
 * <p>Hasta acá, cerrar la caja exigía conexión: la pantalla le pedía los totales al servidor y
 * el botón de cerrar iba derecho. Con el internet caído, el gimnasio termina el día y <b>no
 * puede cerrar</b> — y como el período de un cierre arranca donde terminó el anterior, el día
 * siguiente arrastra el anterior y los dos quedan mezclados en un solo número.</p>
 *
 * <p><b>Por qué estos casos y no otros.</b> Son las reglas de {@code docs/FASE3-CAMINOS.md}
 * traducidas a este camino, probadas <b>juntas y contra Postgres de verdad</b>: las dos
 * garantías que importan acá —el índice único de la V82 y el rango de fechas del período— no
 * existen contra un mock, y el test repetiría exactamente lo que uno ya creía.</p>
 *
 * <ol>
 *   <li><b>Un cierre nunca cuenta plata de otro día</b>, llegue cuando llegue (regla 4).</li>
 *   <li><b>Un reintento no crea un segundo cierre</b> — y acá el duplicado no es una fila de
 *       más: el segundo cuenta CERO y ese cero se convierte en el fondo de mañana.</li>
 *   <li><b>El reloj del terminal se acota, no se cree.</b></li>
 *   <li><b>Las dos cuentas se guardan</b>: la del terminal y la del servidor. Que difieran es
 *       información, no un error a corregir en silencio.</li>
 * </ol>
 */
@Transactional
class CierreSinInternetIntegrationTest extends EmbeddedPostgresTest {

    private static final ZoneId RELOJ = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired
    private EntityManager em;

    @Autowired
    private CajaService cajaService;

    private UUID gym;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio del cierre', true)
                """).setParameter("id", gym).executeUpdate();

        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Lurdes', 'Rollet', :mail, :doc, true, now(), now(), now())
                """)
                .setParameter("id", socio)
                .setParameter("t", gym)
                .setParameter("mail", socio + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .executeUpdate();

        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /** Un cobro en efectivo con SU momento — que es lo que decide en qué cierre cae. */
    private void cobrar(String monto, LocalDateTime cuando) {
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :monto, 'CASH', 'paid', :cuando, now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("t", gym)
                .setParameter("m", socio)
                .setParameter("monto", new BigDecimal(monto))
                .setParameter("cuando", cuando)
                .executeUpdate();
        em.flush();
    }

    private long cuantosCierres() {
        Object n = em.createNativeQuery("SELECT COUNT(*) FROM caja_cierre WHERE tenant_id = :t")
                .setParameter("t", gym)
                .getSingleResult();
        return ((Number) n).longValue();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGLA 4 — un cierre nunca cuenta plata de otro día
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐⭐ el cierre de anoche que sube a la mañana NO se lleva las ventas de hoy")
    void noSeLlevaLasVentasDeLaManianaSiguiente() {
        // ESTE ES EL CASO QUE JUSTIFICA TODO. Se cierra a las 22:00 sin internet; la cola sube
        // a las 09:00 del día siguiente. Sellado con el reloj del SERVIDOR, el período iría
        // hasta las 09:00 y se comería los cobros de la mañana — que ya son del día nuevo.
        LocalDateTime anoche = LocalDateTime.now(RELOJ).minusHours(13);
        LocalDateTime estaManiana = LocalDateTime.now(RELOJ).minusMinutes(30);

        cobrar("40000", anoche.minusHours(2));   // ayer, antes de cerrar
        cobrar("15000", estaManiana);            // hoy, después de cerrar

        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla",
                anoche, UUID.randomUUID(), null, null);

        assertEquals(0, new BigDecimal("40000.00").compareTo(c.getEsperadoEfectivo()),
                "solo lo de ayer: los 15.000 de esta mañana son del día nuevo");
        assertEquals(1, c.getCantidadCobros());
        assertTrue(c.getHasta().isBefore(estaManiana),
                "el período tiene que terminar cuando se cerró, no cuando subió");
    }

    @Test
    @DisplayName("y lo que quedó afuera lo cuenta el cierre siguiente, no se pierde")
    void loQueQuedoAfueraLoCuentaElSiguiente() {
        LocalDateTime anoche = LocalDateTime.now(RELOJ).minusHours(13);
        LocalDateTime estaManiana = LocalDateTime.now(RELOJ).minusMinutes(30);

        cobrar("40000", anoche.minusHours(2));
        cobrar("15000", estaManiana);

        cajaService.cerrar(BigDecimal.ZERO, null, "Carla", anoche, UUID.randomUUID(), null, null);
        CajaCierre hoy = cajaService.cerrar(BigDecimal.ZERO, null, "Carla");

        assertEquals(0, new BigDecimal("15000.00").compareTo(hoy.getEsperadoEfectivo()),
                "el cobro de la mañana cae en el cierre de hoy");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EL REINTENTO
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐⭐ reintentar el mismo cierre no crea un segundo ni mueve el fondo")
    void elReintentoNoCreaUnSegundoCierre() {
        // Un cierre duplicado no deja una fila de más: el segundo arranca donde terminó el
        // primero, cuenta CERO, y su quedaEnCaja —cero— pasa a ser el fondo de mañana. A
        // partir de ahí el error lo arrastran todos los cierres siguientes.
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(3));
        UUID sello = UUID.randomUUID();
        LocalDateTime cuando = LocalDateTime.now(RELOJ).minusMinutes(10);

        CajaCierre primero = cajaService.cerrar(new BigDecimal("30000"), null, "Carla",
                cuando, sello, null, null);
        CajaCierre segundo = cajaService.cerrar(new BigDecimal("30000"), null, "Carla",
                cuando, sello, null, null);
        CajaCierre tercero = cajaService.cerrar(new BigDecimal("30000"), null, "Carla",
                cuando, sello, null, null);

        assertEquals(primero.getId(), segundo.getId(), "el reintento devuelve el que ya estaba");
        assertEquals(primero.getId(), tercero.getId(), "ni el tercero");
        assertEquals(1, cuantosCierres(), "y en la base hay UNO solo");
        assertEquals(0, primero.getQuedaEnCaja().compareTo(segundo.getQuedaEnCaja()),
                "el fondo de mañana no se movió");
    }

    @Test
    @DisplayName("un cierre sin sello no tiene esa protección, y se dice en claro")
    void sinSelloNoHayProteccion() {
        // No es un descuido: los cierres hechos con conexión no traen sello y nunca lo van a
        // traer. La protección existe para lo que pasó por la cola.
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(3));

        CajaCierre a = cajaService.cerrar(BigDecimal.ZERO, null, "Carla");
        assertNull(a.getClientRef());
        assertEquals(1, cuantosCierres());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EL PERÍODO QUE YA CERRÓ OTRO
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐ un cierre encolado cuyo período ya cerró otro se RECHAZA, no se aplica")
    void elPeriodoYaCerradoSeRechaza() {
        // Pasa de verdad: el cierre espera en la cola y, mientras tanto, el dueño cierra desde
        // el portal. Aplicarlo igual haría un cierre de período vacío y su cero se volvería el
        // fondo de mañana.
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(4));
        LocalDateTime anoche = LocalDateTime.now(RELOJ).minusHours(3);

        cajaService.cerrar(BigDecimal.ZERO, null, "El dueño");   // cerró el portal, recién

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> cajaService.cerrar(BigDecimal.ZERO, null, "Carla",
                        anoche, UUID.randomUUID(), null, null));

        // 409 y no 500: la cola trata los 4xx como definitivos, así que lo SACA en vez de
        // reintentarlo para siempre y taponar todo lo que venga detrás.
        assertEquals(409, e.getStatusCode().value(),
                "tiene que ser definitivo, o tapona la cola entera");
        assertEquals(1, cuantosCierres(), "y no quedó un cierre fantasma");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EL RELOJ DEL TERMINAL
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("un reloj adelantado no deja el cierre en el futuro")
    void elRelojAdelantadoSeAcota() {
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(2));

        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla",
                LocalDateTime.now(RELOJ).plusDays(3), UUID.randomUUID(), null, null);

        assertTrue(c.getHasta().isBefore(LocalDateTime.now(RELOJ).plusMinutes(1)),
                "un cierre en el futuro dejaría todo lo que venga después fuera de todo período");
    }

    @Test
    @DisplayName("un reloj atrasado meses se acota al límite, pero el cierre SE GUARDA")
    void elRelojAtrasadoSeAcotaPeroNoSePierde() {
        // Se acota en vez de rechazar a propósito: el cierre PASÓ. Perderlo por no confiar en
        // un reloj es peor que guardarlo corrido.
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(2));

        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla",
                LocalDateTime.now(RELOJ).minusMonths(3), UUID.randomUUID(), null, null);

        assertNotNull(c.getId(), "el cierre se guarda igual");
        assertTrue(c.getHasta().isAfter(LocalDateTime.now(RELOJ).minusHours(MomentoDeclarado.ATRASO_MAXIMO_HORAS + 1)),
                "acotado al límite de atraso, no a tres meses atrás");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAS DOS CUENTAS DE LA MISMA PLATA
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐ se guardan las DOS cuentas: la del terminal y la del servidor")
    void seGuardanLasDosCuentas() {
        // Para que alguien pueda cerrar sin internet, la pantalla tiene que mostrarle el
        // número — y eso obliga a calcularlo también en el terminal. En vez de elegir cuál
        // gana, se guardan las dos: el servidor ve además lo que entró por el portal o por
        // Mercado Pago durante el corte, así que una diferencia DICE algo.
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(3));
        cobrar("15000", LocalDateTime.now(RELOJ).minusHours(2));   // este el terminal no lo vio

        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla",
                LocalDateTime.now(RELOJ).minusMinutes(5), UUID.randomUUID(),
                new BigDecimal("40000"), 1);

        assertEquals(0, new BigDecimal("55000.00").compareTo(c.getEsperadoEfectivo()),
                "el que vale para la plata es el del servidor");
        assertEquals(0, new BigDecimal("40000.00").compareTo(c.getEsperadoSegunTerminal()),
                "y el del terminal queda guardado al lado, no se descarta");
        assertEquals(1, c.getCobrosSegunTerminal());
        assertEquals(2, c.getCantidadCobros());
    }

    @Test
    @DisplayName("el cierre con conexión no tiene dos cuentas que comparar, y queda en NULL")
    void conConexionNoHayQueComparar() {
        // NULL y no cero: cero significaría "el terminal contó cero", que es una afirmación
        // que nadie hizo. Es la misma decisión que el conArqueo en falso.
        cobrar("40000", LocalDateTime.now(RELOJ).minusHours(3));

        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla");

        assertNull(c.getEsperadoSegunTerminal());
        assertNull(c.getCobrosSegunTerminal());
    }
}
