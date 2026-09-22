package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.OwnerInsightsDTO;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Random;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ⭐⭐ EL MISMO PERÍODO, EL MISMO NÚMERO, EN TODAS LAS PANTALLAS.
 *
 * <p>Hasta el 2026-09-22 el tablero, el balance de la caja, Pagos, el Excel del contador y el
 * resumen del dueño contaban la plata cada uno a su manera, y para el mismo mes decían números
 * distintos. Ahora todos preguntan al {@link LibroDeIngresos}, y este test es lo que impide que
 * alguna pantalla vuelva a sumar por su lado: siembra un mes con todo lo que existe (cuotas de
 * las cuatro formas, historial importado, ventas, aportes y retiros del dueño, pendientes,
 * anulados, centavos) y exige que las cinco digan lo mismo, peso por peso.</p>
 */
@Transactional
@DisplayName("Un solo número para la plata")
class UnSoloNumeroIntegrationTest extends EmbeddedPostgresTest {

    private static final ZoneId AR = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired private EntityManager em;
    @Autowired private LibroDeIngresos libro;
    @Autowired private GymDashboardService tablero;
    @Autowired private CajaService caja;
    @Autowired private CajaReporteService reportes;
    @Autowired private GymPaymentService pagos;
    @Autowired private GymOwnerInsightsService resumenDelDueno;

    private final UUID dueno = UUID.randomUUID();
    private UUID gym;
    private YearMonth mes;

    @BeforeEach
    void sembrar() {
        em.createNativeQuery("INSERT INTO app_user (id, created_at, updated_at, email) VALUES (:id, now(), now(), :m)")
                .setParameter("id", dueno).setParameter("m", "dueno-" + dueno + "@test.com").executeUpdate();
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, business_type, is_active)
                VALUES (:id, now(), now(), 'Gimnasio del número', 'GYM', true)
                """).setParameter("id", gym).executeUpdate();
        em.createNativeQuery("""
                INSERT INTO tenant_membership (id, created_at, updated_at, user_id, tenant_id, role, is_active)
                VALUES (:id, now(), now(), :u, :t, 'OWNER', true)
                """).setParameter("id", UUID.randomUUID()).setParameter("u", dueno).setParameter("t", gym).executeUpdate();
        TenantContextHolder.setTenantId(gym);
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "ES256").subject(dueno.toString())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        // El mes EN CURSO, porque el tablero y el resumen del dueño preguntan por él. Las fechas
        // van del 1 al 27 aunque todavía no hayan llegado: el libro cuenta el mes entero.
        mes = YearMonth.now(AR);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("⭐⭐ el tablero, la caja, el Excel, Pagos y el resumen del dueño dicen lo mismo")
    void todasLasPantallasDicenLoMismo() {
        Random azar = new Random(22092026L);
        String[] formas = {"CASH", "TRANSFER", "MERCADOPAGO", "CARD", "OTHER"};
        UUID lote = lote();
        for (int i = 0; i < 80; i++) {
            LocalDateTime cuando = mes.atDay(1 + azar.nextInt(27)).atTime(azar.nextInt(24), azar.nextInt(60));
            String monto = (1000 + azar.nextInt(90) * 500) + (azar.nextInt(5) == 0 ? ".50" : "");
            String estado = switch (azar.nextInt(8)) {
                case 0 -> "pending";
                case 1 -> "cancelled";
                default -> "paid";
            };
            cobro(cuando, monto, formas[azar.nextInt(formas.length)], estado, azar.nextInt(4) == 0 ? lote : null);
        }
        for (int i = 0; i < 15; i++) {
            LocalDateTime cuando = mes.atDay(1 + azar.nextInt(27)).atTime(12, 0);
            String[] rubros = {"Venta", "Venta", "Otro", "Aporte", "Retiro", "Limpieza"};
            String rubro = rubros[azar.nextInt(rubros.length)];
            String tipo = rubro.equals("Retiro") || rubro.equals("Limpieza") ? "EGRESO" : "INGRESO";
            movimiento(cuando, tipo, rubro, String.valueOf(500 + azar.nextInt(20) * 250),
                    azar.nextBoolean() ? "CASH" : "TRANSFER", azar.nextInt(6) == 0);
        }
        // Los bordes del mes: el último instante del mes anterior y el primero del siguiente no son de este.
        cobro(mes.atDay(1).atStartOfDay().minusNanos(1000), "999999", "CASH", "paid", null);
        cobro(mes.plusMonths(1).atDay(1).atStartOfDay(), "888888", "CASH", "paid", null);
        em.flush();

        LocalDate desde = mes.atDay(1);
        LocalDate hasta = mes.atEndOfMonth();
        BigDecimal delLibro = libro.enLosDias(gym, desde, hasta).total();
        assertThat(delLibro).isPositive();

        assertThat(tablero.getResumen().ingresos().delMes()).as("el tablero").isEqualByComparingTo(delLibro);
        assertThat((BigDecimal) tablero.getDashboardStats().get("monthlyRevenue"))
                .as("el tablero de los escritorios viejos").isEqualByComparingTo(delLibro);
        assertThat(caja.balance(desde, hasta).total()).as("el balance de la caja").isEqualByComparingTo(delLibro);
        assertThat(reportes.reporte(desde, hasta).totales().ingresos()).as("el Excel del contador")
                .isEqualByComparingTo(delLibro);
        OwnerInsightsDTO dueno = resumenDelDueno.forCurrentOwner(1);
        assertThat(dueno.getTotals().stream().filter(m -> m.getMonth().equals(mes.toString()))
                .findFirst().orElseThrow().getRevenue()).as("el resumen del dueño").isEqualByComparingTo(delLibro);

        // Y lo que lista Pagos suma exactamente lo cobrado del libro (Pagos lista cobros, no ventas).
        BigDecimal lista = pagos.findForCurrentTenantByDateRange(desde, hasta).stream()
                .filter(GymPayment::estaCobrado).map(GymPayment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(lista).as("la lista de Pagos").isEqualByComparingTo(libro.enLosDias(gym, desde, hasta).cobrado());

        // Para cualquier rango, no solo el mes: el balance, el Excel y la lista de Pagos.
        for (int i = 0; i < 10; i++) {
            LocalDate d = mes.atDay(1 + azar.nextInt(27));
            LocalDate h = d.plusDays(azar.nextInt(5));
            if (h.isAfter(hasta)) h = hasta;
            LibroDeIngresos.Totales t = libro.enLosDias(gym, d, h);
            assertThat(caja.balance(d, h).total()).isEqualByComparingTo(t.total());
            var rep = reportes.reporte(d, h).totales();
            assertThat(rep.ingresos()).isEqualByComparingTo(t.total());
            assertThat(rep.cobrado()).isEqualByComparingTo(t.cobrado());
            assertThat(rep.historial()).isEqualByComparingTo(t.historial());
            assertThat(rep.efectivo().add(rep.transferencia()).add(rep.mercadopago()).add(rep.tarjeta()).add(rep.otros()))
                    .isEqualByComparingTo(rep.cobrado());
        }
    }

    // ── Siembra ──────────────────────────────────────────────────────────────────

    private UUID lote() {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_payment_import (id, tenant_id, created_at, updated_at, aplicada_at)
                VALUES (:id, :t, now(), now(), now())
                """).setParameter("id", id).setParameter("t", gym).executeUpdate();
        return id;
    }

    private void cobro(LocalDateTime cuando, String monto, String metodo, String estado, UUID lote) {
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, amount, payment_method, status, payment_date,
                                          import_id, import_clave, created_at, updated_at)
                VALUES (:id, :t, :monto, :metodo, :estado, :cuando, :lote, :clave, now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", gym)
                .setParameter("monto", new BigDecimal(monto)).setParameter("metodo", metodo)
                .setParameter("estado", estado).setParameter("cuando", cuando)
                .setParameter("lote", lote).setParameter("clave", lote == null ? null : UUID.randomUUID().toString())
                .executeUpdate();
    }

    private void movimiento(LocalDateTime cuando, String tipo, String rubro, String monto, String metodo, boolean anulado) {
        em.createNativeQuery("""
                INSERT INTO caja_movimiento (id, tenant_id, tipo, categoria, detalle, monto, metodo, fecha,
                                              anulado_at, created_at, updated_at)
                VALUES (:id, :t, :tipo, :rubro, 'detalle', :monto, :metodo, :cuando, :anulado, now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", gym).setParameter("tipo", tipo)
                .setParameter("rubro", rubro).setParameter("monto", new BigDecimal(monto))
                .setParameter("metodo", metodo).setParameter("cuando", cuando)
                .setParameter("anulado", anulado ? LocalDateTime.now(AR) : null)
                .executeUpdate();
    }
}
