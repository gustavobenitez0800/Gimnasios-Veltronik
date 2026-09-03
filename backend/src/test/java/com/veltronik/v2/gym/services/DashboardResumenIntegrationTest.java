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
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El resumen del Dashboard, que existe para que la pantalla deje de traerse el padrón entero.
 *
 * <p>Lo que se prueba acá no es que "devuelva algo": es que devuelva <b>los mismos números
 * que mostraba antes</b>. Si al mudar la cuenta del navegador al servidor un total cambiara,
 * el dueño vería que el sistema empezó a decir otra cosa y no habría manera de saber cuál de
 * las dos versiones tenía razón.</p>
 *
 * <p>Corre contra Postgres de verdad porque la mitad del trabajo lo hace la base:
 * {@code date_trunc} para agrupar por mes y {@code EXTRACT} para los cumpleaños. Con
 * repositorios simulados esto pasaría siempre y no probaría nada.</p>
 */
class DashboardResumenIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymDashboardService dashboardService;

    private UUID gym;

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
    private UUID socio(String nombre, Integer venceEnDias, boolean activo, LocalDateTime nacimiento) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, birth_date, created_at, updated_at)
                VALUES (:id, :t, :n, 'Prueba', :mail, :doc, :activo, :vence, :nac, now(), now())
                """)
                .setParameter("id", id).setParameter("t", gym).setParameter("n", nombre)
                .setParameter("mail", id + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("activo", activo)
                .setParameter("vence", venceEnDias == null ? null : LocalDateTime.now().plusDays(venceEnDias))
                .setParameter("nac", nacimiento == null ? null : nacimiento.toLocalDate())
                .executeUpdate();
        return id;
    }

    private void pago(UUID socio, String monto, LocalDateTime cuando, String estado) {
        em.createNativeQuery("""
                INSERT INTO gym_payments (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :monto, 'CASH', :estado, :cuando, now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", gym).setParameter("m", socio)
                .setParameter("monto", new BigDecimal(monto)).setParameter("estado", estado)
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

    @Test
    @Transactional
    @DisplayName("cuenta el padron con el MISMO criterio que mostraba la pantalla")
    void cuentaElPadron() {
        socio("AlDia", 20, true, null);
        socio("TambienAlDia", 5, true, null);
        socio("Vencido", -10, true, null);      // activo pero con la fecha pasada
        socio("DadoDeBaja", 20, false, null);
        em.flush();

        DashboardResumenDTO.Socios s = dashboardService.getResumen().socios();

        assertEquals(4, s.total());
        assertEquals(2, s.activos(), "activo Y con la cuota al dia");
        assertEquals(1, s.vencidos(), "activo pero con la fecha pasada");
        assertEquals(1, s.inactivos(), "dado de baja");
        assertEquals(0, s.suspendidos(), "el backend no distingue suspendido: viaja en cero a proposito");
    }

    /**
     * ⭐ La cuenta que antes hacía el navegador sumando miles de pagos. Ahora la hace
     * Postgres y vuelve un renglón por mes.
     */
    @Test
    @Transactional
    @DisplayName("agrupa los ingresos por mes, y solo los cobrados")
    void agrupaIngresosPorMes() {
        UUID s = socio("Pagador", 20, true, null);
        LocalDateTime hoy = LocalDateTime.now();
        pago(s, "25000", hoy, "PAID");
        pago(s, "15000", hoy.minusDays(1), "PAID");
        pago(s, "99999", hoy, "PENDING");                    // no cobrado: no cuenta
        pago(s, "40000", hoy.minusMonths(1), "PAID");
        em.flush();

        DashboardResumenDTO.Ingresos i = dashboardService.getResumen().ingresos();

        assertEquals(0, i.delMes().compareTo(new BigDecimal("40000")),
                "25.000 + 15.000 de este mes; el pendiente NO suma");
        assertEquals(0, i.delMesAnterior().compareTo(new BigDecimal("40000")));
        assertTrue(i.serieMensual().size() >= 2, "un renglon por mes con cobros");
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
        assertTrue(i.serieMensual().isEmpty());
    }

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

        assertEquals(26, v.total(), "25 vencidos + 1 que vence en 3 dias");
        assertEquals(20, v.primeros().size(), "se mandan los mas urgentes, no los 26");
        assertEquals(1, v.estaSemana(), "los ya vencidos no cuentan como 'vence esta semana'");
    }

    @Test
    @Transactional
    @DisplayName("el mas urgente viene primero, y el vencido se distingue por el signo")
    void ordenYSignoDeLasAlertas() {
        socio("VencioHace10", -10, true, null);
        socio("VenceEn2", 2, true, null);
        em.flush();

        var alertas = dashboardService.getResumen().vencimientos().primeros();

        assertEquals("VencioHace10 Prueba", alertas.get(0).nombre(), "primero el mas urgente");
        assertTrue(alertas.get(0).diasRestantes() < 0, "negativo = ya vencio");
        assertTrue(alertas.get(1).diasRestantes() > 0, "positivo = todavia no");
    }

    /** Antes se traía el padrón entero para mirar diez fechas de nacimiento. */
    @Test
    @Transactional
    @DisplayName("los cumpleanos de hoy salen de la base, comparando dia y mes")
    void cumpleanosDeHoy() {
        LocalDateTime hoy = LocalDateTime.now();
        socio("Cumple", 20, true, hoy.minusYears(30));           // mismo dia y mes, otro año
        socio("NoCumple", 20, true, hoy.minusYears(30).plusDays(1));
        em.flush();

        var cumplen = dashboardService.getResumen().cumplenHoy();

        assertEquals(1, cumplen.size());
        assertEquals("Cumple Prueba", cumplen.get(0));
    }

    @Test
    @Transactional
    @DisplayName("no se mezcla con otro gimnasio")
    void noSeMezclaConOtroGimnasio() {
        socio("Propio", 20, true, null);
        UUID otro = crearGimnasio();
        UUID ajeno = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Ajeno', 'DeOtroGym', :mail, :doc, true, now() - interval '5 days', now(), now())
                """)
                .setParameter("id", ajeno).setParameter("t", otro)
                .setParameter("mail", ajeno + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .executeUpdate();
        em.flush();

        var resumen = dashboardService.getResumen();

        assertEquals(1, resumen.socios().total(), "solo los del gimnasio en curso");
        assertEquals(0, resumen.vencimientos().total(), "el vencido del otro gimnasio no aparece");
    }

    @Test
    @Transactional
    @DisplayName("las ultimas altas vienen como DTO, con nombre y situacion")
    void ultimasAltas() {
        socio("Reciente", 20, true, null);
        em.flush();

        var ultimos = dashboardService.getResumen().ultimosSocios();

        assertEquals(1, ultimos.size());
        assertEquals("Reciente Prueba", ultimos.get(0).getFullName());
        assertEquals("AL_DIA", ultimos.get(0).getSituacion());
    }

    /**
     * El mes en curso se decide en hora de Argentina, no en la del servidor: en Cloud Run
     * (UTC) la franja de 21:00 a 23:59 del último día ya es del mes siguiente, y "Ingresos
     * del Mes" daba $0 justo cuando el dueño cierra el mes.
     */
    @Test
    @Transactional
    @DisplayName("el mes en curso se mide en hora de Argentina")
    void mesEnHoraArgentina() {
        UUID s = socio("Pagador", 20, true, null);
        pago(s, "10000", LocalDateTime.now(), "PAID");
        em.flush();

        var i = dashboardService.getResumen().ingresos();

        assertEquals(YearMonth.now(java.time.ZoneId.of("America/Argentina/Buenos_Aires")),
                YearMonth.from(i.serieMensual().get(i.serieMensual().size() - 1).mes()));
        assertEquals(0, i.delMes().compareTo(new BigDecimal("10000")));
    }
}
