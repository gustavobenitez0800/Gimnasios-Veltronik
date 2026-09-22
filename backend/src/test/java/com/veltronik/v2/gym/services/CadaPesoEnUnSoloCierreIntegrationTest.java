package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ⭐⭐ CADA PESO EN EXACTAMENTE UN CIERRE (V88), contra Postgres de verdad.
 *
 * <p>Hasta el 2026-09-22 un cierre contaba "los cobros con fecha dentro de su período". Estos son
 * los caminos por los que esa regla perdía plata sin que nadie se enterara, y el invariante que
 * los cierra a todos: <b>la suma de todos los cierres más el período abierto es la plata que
 * entró</b>, sin un peso de más ni de menos.</p>
 */
@Transactional
@DisplayName("Cada peso en un solo cierre")
class CadaPesoEnUnSoloCierreIntegrationTest extends EmbeddedPostgresTest {

    private static final ZoneId RELOJ = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired private EntityManager em;
    @Autowired private CajaService caja;
    @Autowired private GymPaymentService pagos;

    private UUID gym;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio del sello', true)
                """).setParameter("id", gym).executeUpdate();
        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Lurdes', 'Rollet', :mail, :doc, true, :vence, now(), now())
                """)
                .setParameter("id", socio).setParameter("t", gym)
                .setParameter("mail", socio + "@test.com").setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("vence", ahora().plusDays(5))
                .executeUpdate();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Los caminos por los que se perdía plata
    // ─────────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("lo que la regla vieja perdía")
    class LoQueSePerdia {

        @Test
        @DisplayName("⭐ un cobro cargado DESPUÉS del cierre con la fecha de antes lo toma el cierre siguiente")
        void elCargadoTardeConFechaVieja() {
            cobrar("40000", "CASH", ahora().minusHours(3), ahora().minusHours(3));
            CajaCierre a = cerrarEn(ahora().minusHours(2));
            assertThat(a.getEsperadoEfectivo()).isEqualByComparingTo("40000");

            // Se olvidaron de cargarlo: se carga ahora, con la fecha de esta mañana.
            cobrar("15000", "CASH", ahora().minusHours(5), ahora().minusMinutes(30));

            CajaCierre b = cerrarAhora();
            assertThat(b.getEsperadoEfectivo())
                    .as("antes caía en un período ya cerrado y no lo contaba NINGÚN cierre")
                    .isEqualByComparingTo("15000");
            assertThat(b.getCantidadCobros()).isEqualTo(1);
        }

        @Test
        @DisplayName("⭐ el cobro del modal de Pagos (a las 00:00) cargado después de un cierre del mediodía")
        void elDeLasCeroHoras() {
            CajaCierre mediodia = cerrarEn(ahora().minusHours(1));
            cobrar("20000", "TRANSFER", mediodia.getHasta().toLocalDate().atStartOfDay(), ahora().minusMinutes(20));

            assertThat(caja.resumenAbierto().transferencia())
                    .as("la pantalla lo muestra antes de cerrar").isEqualByComparingTo("20000");
            assertThat(cerrarAhora().getEsperadoTransferencia()).isEqualByComparingTo("20000");
        }

        @Test
        @DisplayName("un pendiente no cuenta; cuando se marca pagado, lo cuenta el cierre siguiente")
        void elPendienteQueSePaga() {
            UUID id = cobrar("30000", "CASH", ahora().minusHours(5), ahora().minusHours(5), "pending");
            CajaCierre a = cerrarEn(ahora().minusHours(3));
            assertThat(a.getCantidadCobros()).as("el pendiente no puso plata en ningún cajón").isZero();

            em.createNativeQuery("UPDATE gym_payment SET status = 'paid', updated_at = :h WHERE id = :id")
                    .setParameter("h", ahora().minusHours(1)).setParameter("id", id).executeUpdate();

            assertThat(cerrarAhora().getEsperadoEfectivo()).isEqualByComparingTo("30000");
        }

        @Test
        @DisplayName("un cobro justo en el borde entre dos cierres se cuenta UNA vez (antes, en los dos)")
        void elDelBorde() {
            LocalDateTime borde = ahora().minusHours(2);
            cobrar("10000", "CASH", borde, borde.minusMinutes(1));
            CajaCierre a = cerrarEn(borde);
            CajaCierre b = cerrarAhora();

            assertThat(a.getEsperadoEfectivo()).isEqualByComparingTo("10000");
            assertThat(b.getEsperadoEfectivo()).isEqualByComparingTo("0");
        }

        @Test
        @DisplayName("⭐ los cobros de anoche que subieron a la mañana entran en el cierre de anoche, no en el de hoy")
        void elCierreSinInternetConLosCobrosDeLaNoche() {
            LocalDateTime anoche = ahora().minusHours(12);
            // Cobrado a las 21:00 sin internet, subió a las 09:00 (created_at de la mañana).
            cobrar("25000", "CASH", anoche.minusHours(1), ahora().minusMinutes(40));
            // Cobrado esta mañana, con internet.
            cobrar("5000", "CASH", ahora().minusMinutes(35), ahora().minusMinutes(35));

            CajaCierre deAnoche = cerrarEn(anoche);   // subió después que los dos

            assertThat(deAnoche.getEsperadoEfectivo()).isEqualByComparingTo("25000");
            assertThat(cerrarAhora().getEsperadoEfectivo()).isEqualByComparingTo("5000");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lo que se corrige después de cerrado
    // ─────────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("las correcciones de un día ya cerrado")
    class LasCorrecciones {

        @Test
        @DisplayName("⭐ bajar el monto de un cobro ya cerrado: la diferencia entra, a la vista, en el cierre siguiente")
        void bajarElMonto() {
            UUID id = cobrar("48000", "CASH", ahora().minusHours(3), ahora().minusHours(3));
            CajaCierre a = cerrarEn(ahora().minusHours(2));
            assertThat(a.getQuedaEnCaja()).isEqualByComparingTo("48000");

            pagos.actualizar(id, cambios("40000", null), "Carla");
            em.flush();

            var abierto = caja.resumenAbierto();
            assertThat(abierto.ajustesEfectivo()).isEqualByComparingTo("-8000");
            assertThat(caja.correccionesPendientes()).singleElement().satisfies(c -> {
                assertThat(c.montoAntes()).isEqualByComparingTo("48000");
                assertThat(c.montoDespues()).isEqualByComparingTo("40000");
            });

            CajaCierre b = cerrarAhora();
            assertThat(b.getAjustesEfectivo()).isEqualByComparingTo("-8000");
            assertThat(b.getCantidadAjustes()).isEqualTo(1);
            assertThat(b.getQuedaEnCaja()).as("48.000 que quedaron ayer menos los 8.000 corregidos")
                    .isEqualByComparingTo("40000");
            assertThat(cuantasCorrecciones(b.getId())).isEqualTo(1);

            assertThat(caja.resumenAbierto().cantidadAjustes())
                    .as("una corrección entra UNA vez: quedó re-sellada con el valor nuevo").isZero();
        }

        @Test
        @DisplayName("pasarlo de efectivo a transferencia saca la plata del cajón y no cambia el total")
        void cambiarLaFormaDePago() {
            UUID id = cobrar("10000", "CASH", ahora().minusHours(3), ahora().minusHours(3));
            cerrarEn(ahora().minusHours(2));

            pagos.actualizar(id, cambios(null, "TRANSFER"), "Carla");
            em.flush();

            CajaCierre b = cerrarAhora();
            assertThat(b.getAjustesEfectivo()).isEqualByComparingTo("-10000");
            assertThat(b.getAjustesOtrosMedios()).isEqualByComparingTo("10000");
        }

        @Test
        @DisplayName("⭐ anular un cobro ya cerrado lo descuenta en el cierre siguiente y le devuelve al socio su vencimiento")
        void anularUnCobroCerrado() {
            LocalDateTime venciaEl = vencimiento();
            GymPayment p = nuevoCobro("30000", "CASH");
            LocalDateTime venceConElCobro = vencimiento();
            assertThat(venceConElCobro).isAfter(venciaEl);

            dormir();
            CajaCierre a = cerrarAhora();
            assertThat(a.getEsperadoEfectivo()).isEqualByComparingTo("30000");

            var anulacion = pagos.anular(p.getId(), "Se cobró dos veces", "Dueño");
            em.flush();

            assertThat(anulacion.vencimientoRestaurado()).isEqualTo(venciaEl);
            assertThat(vencimiento()).as("el socio vuelve a vencer cuando vencía").isEqualTo(venciaEl);
            assertThat(em.createNativeQuery("SELECT status FROM gym_payment WHERE id = :id")
                    .setParameter("id", p.getId()).getSingleResult()).isEqualTo("cancelled");

            dormir();
            CajaCierre b = cerrarAhora();
            assertThat(b.getAjustesEfectivo()).isEqualByComparingTo("-30000");
            assertThat(b.getQuedaEnCaja()).isEqualByComparingTo("0");
        }

        @Test
        @DisplayName("un cobro anulado ya no se puede editar")
        void elAnuladoNoSeEdita() {
            GymPayment p = nuevoCobro("30000", "CASH");
            pagos.anular(p.getId(), null, "Dueño");

            org.assertj.core.api.Assertions.assertThatThrownBy(
                    () -> pagos.actualizar(p.getId(), cambios("1", null), "Carla"))
                    .hasMessageContaining("anulado");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lo muy viejo
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("un cobro cargado hoy con fecha de hace 40 días es carga histórica: no entra al cajón de hoy")
    void laCargaHistorica() {
        UUID viejo = cobrar("99000", "CASH", ahora().minusDays(40), ahora().minusMinutes(10));
        cobrar("1000", "CASH", ahora().minusMinutes(5), ahora().minusMinutes(5));

        CajaCierre c = cerrarAhora();

        assertThat(c.getEsperadoEfectivo()).isEqualByComparingTo("1000");
        Object[] sello = (Object[]) em.createNativeQuery(
                "SELECT sellado_at, cierre_id FROM gym_payment WHERE id = :id").setParameter("id", viejo).getSingleResult();
        assertThat(sello[0]).as("queda sellado: no vuelve a aparecer como pendiente").isNotNull();
        assertThat(sello[1]).as("pero sin cierre: ningún arqueo lo contó").isNull();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ⭐⭐ EL INVARIANTE
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐⭐ con cualquier secuencia de cobros, correcciones, anulaciones y cierres, la suma de los cierres es la plata que entró")
    void laSumaDeLosCierresEsLaPlataQueEntro() {
        Random azar = new Random(20260922L);
        String[] formas = {"CASH", "TRANSFER", "MERCADOPAGO", "CARD"};
        List<UUID> cobros = new ArrayList<>();

        for (int paso = 0; paso < 120; paso++) {
            int que = azar.nextInt(10);
            if (que < 5 || cobros.isEmpty()) {
                // Un cobro, a veces con la fecha de horas atrás (cargado tarde).
                LocalDateTime fecha = azar.nextInt(4) == 0 ? ahora().minusHours(1 + azar.nextInt(20)) : ahora();
                cobros.add(cobrar(String.valueOf(500 + azar.nextInt(50) * 500), formas[azar.nextInt(4)], fecha, ahora()));
            } else if (que < 7) {
                UUID id = cobros.get(azar.nextInt(cobros.size()));
                if (!anulado(id)) {
                    pagos.actualizar(id, azar.nextBoolean()
                            ? cambios(String.valueOf(1000 + azar.nextInt(40) * 250), null)
                            : cambios(null, formas[azar.nextInt(4)]), "Carla");
                }
            } else if (que < 8) {
                UUID id = cobros.get(azar.nextInt(cobros.size()));
                if (!anulado(id)) pagos.anular(id, "prueba", "Dueño");
            } else {
                em.flush();
                dormir();
                cerrarAhora();
            }
            em.flush();
        }

        // Lo contado por todos los cierres (lo nuevo de cada uno más sus correcciones) más lo que
        // todavía está abierto...
        Object[] cierres = (Object[]) em.createNativeQuery("""
                SELECT COALESCE(SUM(esperado_efectivo + esperado_transferencia + esperado_mercadopago
                                    + esperado_tarjeta + esperado_otros), 0),
                       COALESCE(SUM(ajustes_efectivo + ajustes_otros_medios), 0),
                       COALESCE(SUM(esperado_efectivo + ajustes_efectivo), 0)
                  FROM caja_cierre WHERE tenant_id = :t
                """).setParameter("t", gym).getSingleResult();
        var abierto = caja.resumenAbierto();
        BigDecimal contado = ((BigDecimal) cierres[0]).add((BigDecimal) cierres[1])
                .add(abierto.cobrado()).add(abierto.ajustesEfectivo()).add(abierto.ajustesOtrosMedios());

        // ...es lo que hoy vale todo lo cobrado.
        BigDecimal entro = (BigDecimal) em.createNativeQuery(
                "SELECT COALESCE(SUM(amount), 0) FROM gym_payment WHERE tenant_id = :t AND status = 'paid'")
                .setParameter("t", gym).getSingleResult();

        assertThat(contado).as("ni un peso de más ni de menos").isEqualByComparingTo(entro);

        // Y lo mismo, solo en efectivo: la cadena de cajones cuadra.
        BigDecimal efectivoContado = ((BigDecimal) cierres[2]).add(abierto.efectivo()).add(abierto.ajustesEfectivo());
        BigDecimal efectivoQueEntro = (BigDecimal) em.createNativeQuery(
                "SELECT COALESCE(SUM(amount), 0) FROM gym_payment WHERE tenant_id = :t AND status = 'paid' "
                        + "AND payment_method = 'CASH'")
                .setParameter("t", gym).getSingleResult();
        assertThat(efectivoContado).isEqualByComparingTo(efectivoQueEntro);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // El sellado inicial de la V88
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐ la migración sella lo que la regla vieja ya contó, y deja abierto lo que nunca contó nadie")
    void elSelladoInicialDeLaMigracion() throws Exception {
        LocalDateTime d0 = ahora().minusDays(3);
        LocalDateTime d1 = ahora().minusDays(2);
        LocalDateTime d2 = ahora().minusDays(1);
        // C1 se hizo sin internet a la noche (d1) y subió 10 horas después.
        UUID c1 = cierreViejo(d0, d1, d1.plusHours(10));
        UUID c2 = cierreViejo(d1, d2, d2);

        UUID contado = cobrar("100", "CASH", d1.minusHours(5), d1.minusHours(5));
        UUID subioAntesDelCierre = cobrar("200", "CASH", d1.minusHours(1), d1.plusHours(9));
        UUID cargadoTarde = cobrar("300", "CASH", d1.minusHours(4), d1.plusHours(11));
        UUID anteriorAlPrimero = cobrar("400", "CASH", d0.minusDays(1), d0.minusDays(1));
        UUID abierto = cobrar("500", "CASH", d2.plusHours(2), d2.plusHours(2));
        UUID pendiente = cobrar("600", "CASH", d1.minusHours(2), d1.minusHours(2), "pending");
        UUID delSegundo = cobrar("700", "TRANSFER", d2.minusHours(1), d2.minusHours(1));

        em.flush();
        for (String sentencia : selladoInicial()) {
            em.createNativeQuery(sentencia).executeUpdate();
        }

        assertThat(cierreDe(contado)).isEqualTo(c1);
        assertThat(cierreDe(subioAntesDelCierre)).as("el cierre de la noche lo contó al subir").isEqualTo(c1);
        assertThat(cierreDe(delSegundo)).isEqualTo(c2);
        assertThat(sellado(cargadoTarde)).as("ningún cierre lo contó: lo toma el próximo").isFalse();
        assertThat(sellado(anteriorAlPrimero)).as("anterior al primer cierre: carga histórica").isTrue();
        assertThat(cierreDe(anteriorAlPrimero)).isNull();
        assertThat(sellado(abierto)).as("es del período abierto").isFalse();
        assertThat(sellado(pendiente)).as("un pendiente no se sella").isFalse();

        // Y el próximo cierre toma exactamente lo que ningún cierre había contado.
        em.createNativeQuery("UPDATE caja_cierre SET queda_en_caja = 0 WHERE id IN (:a, :b)")
                .setParameter("a", c1).setParameter("b", c2).executeUpdate();
        CajaCierre proximo = cerrarAhora();
        assertThat(proximo.getEsperadoEfectivo()).isEqualByComparingTo("800");   // 300 + 500
    }

    // ── Ayudas ───────────────────────────────────────────────────────────────

    private static LocalDateTime ahora() {
        return LocalDateTime.now(RELOJ);
    }

    private UUID cobrar(String monto, String metodo, LocalDateTime fecha, LocalDateTime altaEn) {
        return cobrar(monto, metodo, fecha, altaEn, "paid");
    }

    /** Un cobro con SU fecha y SU momento de alta: son los dos que deciden en qué cierre cae. */
    private UUID cobrar(String monto, String metodo, LocalDateTime fecha, LocalDateTime altaEn, String estado) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :monto, :metodo, :estado, :fecha, :alta, :alta)
                """)
                .setParameter("id", id).setParameter("t", gym).setParameter("m", socio)
                .setParameter("monto", new BigDecimal(monto)).setParameter("metodo", metodo)
                .setParameter("estado", estado).setParameter("fecha", fecha).setParameter("alta", altaEn)
                .executeUpdate();
        return id;
    }

    /** Un cobro por el camino de verdad: corre el vencimiento del socio. */
    private GymPayment nuevoCobro(String monto, String metodo) {
        GymPayment p = new GymPayment();
        p.setMemberId(socio);
        p.setAmount(new BigDecimal(monto));
        p.setPaymentMethod(metodo);
        p.setStatus("paid");
        p.setPaymentDate(ahora());
        GymPayment guardado = pagos.saveForCurrentTenant(p);
        em.flush();
        return guardado;
    }

    private static GymPaymentService.Cambios cambios(String monto, String metodo) {
        return new GymPaymentService.Cambios(monto == null ? null : new BigDecimal(monto), null, metodo,
                null, null, null, null);
    }

    private CajaCierre cerrarEn(LocalDateTime cuando) {
        CajaCierre c = caja.cerrar(BigDecimal.ZERO, null, "Carla", cuando, UUID.randomUUID(), null, null);
        em.flush();
        return c;
    }

    private CajaCierre cerrarAhora() {
        CajaCierre c = caja.cerrar(BigDecimal.ZERO, null, "Carla");
        em.flush();
        return c;
    }

    /** Dos cierres en el mismo microsegundo serían el mismo período: el segundo daría 409. */
    private static void dormir() {
        try {
            Thread.sleep(3);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private LocalDateTime vencimiento() {
        em.flush();
        Object v = em.createNativeQuery("SELECT membership_end FROM gym_member WHERE id = :id")
                .setParameter("id", socio).getSingleResult();
        return v instanceof java.sql.Timestamp ts ? ts.toLocalDateTime() : (LocalDateTime) v;
    }

    private boolean anulado(UUID id) {
        return "cancelled".equals(em.createNativeQuery("SELECT status FROM gym_payment WHERE id = :id")
                .setParameter("id", id).getSingleResult());
    }

    private long cuantasCorrecciones(UUID cierre) {
        return ((Number) em.createNativeQuery("SELECT COUNT(*) FROM caja_cierre_ajuste WHERE cierre_id = :c")
                .setParameter("c", cierre).getSingleResult()).longValue();
    }

    private UUID cierreViejo(LocalDateTime desde, LocalDateTime hasta, LocalDateTime calculadoEn) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO caja_cierre (id, tenant_id, desde, hasta, con_arqueo, queda_en_caja, retiro_efectivo,
                                          created_at, updated_at)
                VALUES (:id, :t, :d, :h, false, 0, 0, :c, :c)
                """)
                .setParameter("id", id).setParameter("t", gym).setParameter("d", desde).setParameter("h", hasta)
                .setParameter("c", calculadoEn)
                .executeUpdate();
        return id;
    }

    private UUID cierreDe(UUID pago) {
        return (UUID) em.createNativeQuery("SELECT cierre_id FROM gym_payment WHERE id = :id")
                .setParameter("id", pago).getSingleResult();
    }

    private boolean sellado(UUID pago) {
        return em.createNativeQuery("SELECT sellado_at FROM gym_payment WHERE id = :id")
                .setParameter("id", pago).getSingleResult() != null;
    }

    /** Las sentencias del bloque marcado en la V88: lo que se prueba es lo que se migra. */
    private static List<String> selladoInicial() throws Exception {
        String sql;
        try (var in = CadaPesoEnUnSoloCierreIntegrationTest.class.getResourceAsStream(
                "/db/migration/V88__Cada_Peso_En_Un_Solo_Cierre.sql")) {
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n");
        }
        int desde = sql.indexOf("-- <sellado-inicial>");
        int hasta = sql.indexOf("-- </sellado-inicial>");
        assertThat(desde).as("la marca de inicio del bloque").isPositive();
        assertThat(hasta).as("la marca de fin del bloque").isGreaterThan(desde);
        List<String> sentencias = new ArrayList<>();
        for (String s : sql.substring(desde + "-- <sellado-inicial>".length(), hasta).split(";")) {
            String limpia = s.lines().filter(l -> !l.trim().startsWith("--")).reduce("", (a, b) -> a + "\n" + b).trim();
            if (!limpia.isEmpty()) sentencias.add(limpia);
        }
        assertThat(sentencias).hasSize(4);
        return sentencias;
    }
}
