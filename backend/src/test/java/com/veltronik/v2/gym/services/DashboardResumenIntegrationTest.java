package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.DashboardResumenDTO;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El resumen del Dashboard, que existe para que la pantalla deje de traerse el padrón entero.
 *
 * <p>Lo que se prueba acá no es que "devuelva algo": es que cuente <b>con el mismo criterio
 * que el resto del sistema</b> (la situación de cada socio la decide {@code MemberAccessPolicy})
 * y que el mes en curso se muestre como lo que es: un mes que todavía no terminó.</p>
 *
 * <p>Corre contra Postgres de verdad porque la mitad del trabajo lo hace la base:
 * {@code date_trunc} para agrupar por mes, {@code FILTER} para contar el padrón y
 * {@code to_char} para los cumpleaños. Con repositorios simulados esto pasaría siempre.</p>
 *
 * <p>⚠️ Todas las fechas salen del reloj de ARGENTINA, el mismo que usa el servicio. El CI
 * corre en UTC: con {@code LocalDateTime.now()} a secas, de 21:00 a 23:59 del último día del
 * mes el cobro "de hoy" caía en el mes siguiente y los tests fallaban tres horas por mes.</p>
 */
class DashboardResumenIntegrationTest extends EmbeddedPostgresTest {

    private static final ZoneId RELOJ = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired
    private EntityManager em;

    @Autowired
    private GymDashboardService dashboardService;

    private UUID gym;

    private static LocalDateTime ahora() {
        return LocalDateTime.now(RELOJ);
    }

    private static LocalDateTime max(LocalDateTime a, LocalDateTime b) {
        return a.isAfter(b) ? a : b;
    }

    private static LocalDateTime min(LocalDateTime a, LocalDateTime b) {
        return a.isBefore(b) ? a : b;
    }

    private UUID crearGimnasio() {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio del resumen', true)
                """).setParameter("id", id).executeUpdate();
        return id;
    }

    /**
     * @param venceEnDias días desde hoy (negativo = ya venció, null = sin fecha cargada)
     * @param activo      false = dado de baja
     */
    private UUID socio(String nombre, Integer venceEnDias, boolean activo, LocalDate nacimiento) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, birth_date, created_at, updated_at)
                VALUES (:id, :t, :n, 'Prueba', :mail, :doc, :activo, :vence, :nac, now(), now())
                """)
                .setParameter("id", id).setParameter("t", gym).setParameter("n", nombre)
                .setParameter("mail", id + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("activo", activo)
                .setParameter("vence", venceEnDias == null ? null : ahora().plusDays(venceEnDias))
                .setParameter("nac", nacimiento)
                .executeUpdate();
        return id;
    }

    private void pago(UUID socio, String monto, LocalDateTime cuando, String estado) {
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :monto, 'CASH', :estado, :cuando, now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", gym).setParameter("m", socio)
                .setParameter("monto", new BigDecimal(monto))
                // Los tests se escribieron con "PAID" cuando convivían las dos ortografías. Desde la
                // V88 hay una sola y la exige la base: se guarda como la guardaría la app.
                .setParameter("estado", estado.toLowerCase(java.util.Locale.ROOT))
                .setParameter("cuando", cuando)
                .executeUpdate();
    }

    @BeforeEach
    void sembrar() {
        gym = crearGimnasio();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    // ── El padrón ──────────────────────────────────────────────────────────────

    @Test
    @Transactional
    @DisplayName("⭐ cuenta el padrón con el criterio de MemberAccessPolicy, y los cuatro suman el total")
    void cuentaElPadron() {
        socio("AlDia", 20, true, null);
        socio("TambienAlDia", 5, true, null);
        socio("Vencido", -10, true, null);      // activo pero con la fecha pasada
        socio("EnGracia", -1, true, null);      // debe la cuota aunque todavía entre
        socio("SinFecha", null, true, null);    // sigue siendo socio, sin vencimiento cargado
        socio("DadoDeBaja", 20, false, null);
        em.flush();

        DashboardResumenDTO.Socios s = dashboardService.getResumen().socios();

        assertEquals(6, s.total());
        assertEquals(2, s.activos(), "al día = cuota vigente; el SIN FECHA ya no cuenta como al día");
        assertEquals(2, s.vencidos(), "vencidos, con los que están en gracia: es el mismo filtro de Socios");
        assertEquals(1, s.sinFecha(), "falta el dato: la política lo marca aparte");
        assertEquals(1, s.inactivos(), "dado de baja");
        assertEquals(s.total(), s.activos() + s.vencidos() + s.sinFecha() + s.inactivos());
        assertEquals(0, s.suspendidos(), "el backend no distingue suspendido: viaja en cero a propósito");
    }

    @Test
    @Transactional
    @DisplayName("⭐ 'vence esta semana' no cuenta a los dados de baja, igual que la lista de alertas")
    void estaSemanaSinBajas() {
        socio("PorVencer", 3, true, null);
        socio("BajaPorVencer", 3, false, null);
        em.flush();

        DashboardResumenDTO.Vencimientos v = dashboardService.getResumen().vencimientos();

        assertEquals(1, v.estaSemana());
        assertEquals(1, v.primeros().size());
        assertEquals(1, ((Number) dashboardService.getDashboardStats().get("expiringMembers")).longValue(),
                "el endpoint viejo cuenta igual");
    }

    // ── Los ingresos ───────────────────────────────────────────────────────────

    /**
     * ⭐ La cuenta que antes hacía el navegador sumando miles de pagos. Ahora la hace
     * Postgres y vuelve un renglón por mes.
     */
    @Test
    @Transactional
    @DisplayName("agrupa los ingresos por mes, y solo los cobrados")
    void agrupaIngresosPorMes() {
        UUID s = socio("Pagador", 20, true, null);
        LocalDateTime hoy = ahora();
        // Los dos en el MISMO instante: "ayer" el día 1 es el mes pasado, y este test fallaba
        // todos los primeros de mes.
        pago(s, "25000", hoy, "PAID");
        pago(s, "15000", hoy, "PAID");
        pago(s, "99999", hoy, "PENDING");                    // no cobrado: no cuenta
        pago(s, "40000", hoy.minusMonths(1), "PAID");
        em.flush();

        DashboardResumenDTO.Ingresos i = dashboardService.getResumen().ingresos();

        assertEquals(0, i.delMes().compareTo(new BigDecimal("40000")),
                "25.000 + 15.000 de este mes; el pendiente NO suma");
        assertEquals(0, i.delMesAnterior().compareTo(new BigDecimal("40000")));
        assertEquals(2, i.serieMensual().size(), "un renglón por mes con cobros");
    }

    @Test
    @Transactional
    @DisplayName("un mes sin cobros vale cero, no rompe ni desaparece")
    void mesSinCobros() {
        socio("SinPagos", 20, true, null);
        em.flush();

        DashboardResumenDTO.Ingresos i = dashboardService.getResumen().ingresos();

        assertEquals(0, i.delMes().compareTo(BigDecimal.ZERO));
        assertEquals(0, i.delMesAnterior().compareTo(BigDecimal.ZERO));
        assertEquals(0, i.delMismoPeriodoAnterior().compareTo(BigDecimal.ZERO));
        assertNull(i.primerCobro(), "nunca cobró");
        assertTrue(i.serieMensual().isEmpty());
    }

    @Test
    @Transactional
    @DisplayName("⭐ el mes en curso se compara contra el MISMO tramo del mes pasado, no contra el mes entero")
    void mismoPeriodoDelMesAnterior() {
        UUID s = socio("Pagador", 20, true, null);
        LocalDateTime hoy = ahora();
        LocalDateTime inicioMesAnterior = YearMonth.from(hoy).minusMonths(1).atDay(1).atStartOfDay();
        LocalDateTime finMesAnterior = YearMonth.from(hoy).atDay(1).atStartOfDay().minusSeconds(1);
        LocalDateTime corte = hoy.minusMonths(1);
        // Acotados al mes pasado a propósito: el día 1 a las 00:02, "cinco minutos antes del
        // corte" es el mes anterior al pasado; el 31, "cinco después" ya es este mes.
        LocalDateTime justoAntes = max(inicioMesAnterior, corte.minusMinutes(5));
        LocalDateTime justoDespues = min(finMesAnterior, corte.plusMinutes(5));
        pago(s, "30000", inicioMesAnterior, "PAID");   // dentro del tramo
        pago(s, "12000", justoAntes, "PAID");          // dentro, justo antes del corte
        pago(s, "50000", justoDespues, "PAID");        // después del corte: afuera
        em.flush();

        DashboardResumenDTO.Ingresos i = dashboardService.getResumen().ingresos();

        assertEquals(0, i.delMismoPeriodoAnterior().compareTo(new BigDecimal("42000")),
                "del 1° del mes pasado hasta este mismo día y hora");
        assertEquals(0, i.delMesAnterior().compareTo(new BigDecimal("92000")), "el mes entero sigue viajando");
        assertEquals(inicioMesAnterior, i.primerCobro());
    }

    @Test
    @Transactional
    @DisplayName("⭐ un cobro fechado en el futuro no estira la serie ni suma en el mes")
    void cobroEnElFuturo() {
        UUID s = socio("Pagador", 20, true, null);
        pago(s, "10000", ahora(), "PAID");
        pago(s, "70000", ahora().plusMonths(3), "PAID");   // "2027" en vez de "2026", mal tipeado
        em.flush();

        DashboardResumenDTO.Ingresos i = dashboardService.getResumen().ingresos();

        assertEquals(1, i.serieMensual().size(), "la serie termina en el mes en curso");
        assertEquals(0, i.delMes().compareTo(new BigDecimal("10000")));
        assertEquals(0, new BigDecimal(String.valueOf(dashboardService.getDashboardStats().get("monthlyRevenue")))
                .compareTo(new BigDecimal("10000")), "el endpoint viejo tampoco lo suma");
    }

    /**
     * El mes en curso se decide en hora de Argentina, no en la del servidor: en Cloud Run
     * (UTC) la franja de 21:00 a 23:59 del último día ya es del mes siguiente, y "Ingresos
     * del Mes" daba $0 justo cuando el dueño cierra el mes.
     */
    @Test
    @Transactional
    @DisplayName("el mes en curso se mide en hora de Argentina, y el resumen dice qué día es")
    void mesEnHoraArgentina() {
        UUID s = socio("Pagador", 20, true, null);
        pago(s, "10000", ahora(), "PAID");
        em.flush();

        var resumen = dashboardService.getResumen();
        var i = resumen.ingresos();

        assertEquals(YearMonth.now(RELOJ), YearMonth.from(i.serieMensual().get(i.serieMensual().size() - 1).mes()));
        assertEquals(0, i.delMes().compareTo(new BigDecimal("10000")));
        assertEquals(LocalDate.now(RELOJ), resumen.hoy());
    }

    // ── Las alertas ────────────────────────────────────────────────────────────

    /**
     * El gimnasio que migró 385 socios puede tener cientos vencidos. Antes venían todos para
     * pintar una lista que nadie lee entera.
     */
    @Test
    @Transactional
    @DisplayName("⭐ las alertas vienen ACOTADAS, con el total aparte")
    void alertasAcotadas() {
        for (int i = 0; i < 25; i++) socio("Vencido" + i, -(i + 1), true, null);
        socio("PorVencer", 3, true, null);
        socio("Tranquilo", 60, true, null);   // ni vencido ni por vencer: no aparece
        em.flush();

        DashboardResumenDTO.Vencimientos v = dashboardService.getResumen().vencimientos();

        assertEquals(26, v.total(), "25 vencidos + 1 que vence en 3 días");
        assertEquals(20, v.primeros().size(), "se mandan los más urgentes, no los 26");
        assertEquals(1, v.estaSemana(), "los ya vencidos no cuentan como 'vence esta semana'");
    }

    @Test
    @Transactional
    @DisplayName("⭐ primero lo que está pasando AHORA, no el que venció hace meses")
    void alertasPorCercania() {
        for (int i = 0; i < 30; i++) socio("VencioHaceMeses" + i, -(90 + i), true, null);
        socio("VencioAyer", -1, true, null);
        socio("VenceEn2", 2, true, null);
        em.flush();

        var alertas = dashboardService.getResumen().vencimientos().primeros();

        assertEquals("VencioAyer Prueba", alertas.get(0).nombre(), "el que venció ayer: hay que llamarlo hoy");
        assertEquals("VenceEn2 Prueba", alertas.get(1).nombre(), "y el que vence en dos días");
        assertTrue(alertas.get(0).diasRestantes() < 0, "negativo = ya venció");
        assertTrue(alertas.get(1).diasRestantes() > 0, "positivo = todavía no");
    }

    // ── Cumpleaños, altas y aislamiento ────────────────────────────────────────

    /** Antes se traía el padrón entero para mirar diez fechas de nacimiento. */
    @Test
    @Transactional
    @DisplayName("los cumpleaños de hoy salen de la base, comparando día y mes")
    void cumpleanosDeHoy() {
        LocalDate hoy = LocalDate.now(RELOJ);
        socio("Cumple", 20, true, hoy.minusYears(30));           // mismo día y mes, otro año
        socio("NoCumple", 20, true, hoy.minusYears(30).plusDays(1));
        em.flush();

        var cumplen = dashboardService.getResumen().cumplenHoy();

        assertEquals(1, cumplen.size());
        assertEquals("Cumple Prueba", cumplen.get(0));
    }

    @Test
    @Transactional
    @DisplayName("el del 29 de febrero cumple el 28 en los años que no son bisiestos")
    void cumpleanos29DeFebrero() {
        socio("Bisiesto", 20, true, LocalDate.of(2000, 2, 29));
        socio("Del28", 20, true, LocalDate.of(1990, 2, 28));
        em.flush();

        assertEquals(2, dashboardService.cumplenHoy(gym, LocalDate.of(2027, 2, 28)).size(), "2027 no es bisiesto");
        assertEquals(1, dashboardService.cumplenHoy(gym, LocalDate.of(2028, 2, 28)).size(), "en 2028 cumple el 29");
        assertEquals(1, dashboardService.cumplenHoy(gym, LocalDate.of(2028, 2, 29)).size());
    }

    @Test
    @Transactional
    @DisplayName("no se mezcla con otro gimnasio")
    void noSeMezclaConOtroGimnasio() {
        socio("Propio", 20, true, null);
        UUID otro = crearGimnasio();
        UUID ajeno = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Ajeno', 'DeOtroGym', :mail, :doc, true, :vence, now(), now())
                """)
                .setParameter("id", ajeno).setParameter("t", otro)
                .setParameter("mail", ajeno + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("vence", ahora().minusDays(5))
                .executeUpdate();
        em.flush();

        var resumen = dashboardService.getResumen();

        assertEquals(1, resumen.socios().total(), "solo los del gimnasio en curso");
        assertEquals(0, resumen.vencimientos().total(), "el vencido del otro gimnasio no aparece");
    }

    @Test
    @Transactional
    @DisplayName("las últimas altas vienen como DTO, con nombre y situación")
    void ultimasAltas() {
        socio("Reciente", 20, true, null);
        em.flush();

        var ultimos = dashboardService.getResumen().ultimosSocios();

        assertEquals(1, ultimos.size());
        assertEquals("Reciente Prueba", ultimos.get(0).getFullName());
        assertEquals("AL_DIA", ultimos.get(0).getSituacion());
    }
}
