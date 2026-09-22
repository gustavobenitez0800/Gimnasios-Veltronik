package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.ImportacionCaja.Fila;
import com.veltronik.v2.gym.dto.ImportacionCaja.Pedido;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El balance por rango y el reporte del contador, contra Postgres real.
 *
 * <p>Con un día FIJO del pasado y no con "hoy": un test de fechas relativas a now() se cae
 * solo de madrugada, y ya pasó tres veces en este proyecto.</p>
 */
@DisplayName("El Excel del contador")
class CajaReporteIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private EntityManager em;
    @Autowired private CajaService caja;
    @Autowired private CajaReporteService reportes;
    @Autowired private ImportacionCajaService importador;

    private static final LocalDate DIA = LocalDate.of(2026, 3, 10);

    private UUID gym;
    private UUID socio;
    private UUID cajera;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio Reporte', true)
                """).setParameter("id", gym).executeUpdate();
        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Lucía', 'Pereyra', '', '30111222', true, now(), now(), now())
                """).setParameter("id", socio).setParameter("t", gym).executeUpdate();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    @Test
    @Transactional
    @DisplayName("⭐ el balance de un rango cuenta los dos días de las puntas, y nada de afuera")
    void elRangoIncluyeLasPuntas() {
        cobrar(DIA.minusDays(1).atTime(23, 59, 59), "1000", "cash", "paid", null);
        cobrar(DIA.atStartOfDay(), "2000", "cash", "paid", null);
        cobrar(DIA.atTime(15, 0), "3000", "transfer", "paid", null);
        // El último microsegundo del día es del día; las 00:00 del siguiente, no.
        cobrar(DIA.atTime(23, 59, 59, 999_999_000), "4000", "mercadopago", "paid", null);
        cobrar(DIA.plusDays(1).atStartOfDay(), "5000", "cash", "paid", null);

        CajaService.Resumen r = caja.balance(DIA, DIA);
        assertThat(r.efectivo()).isEqualByComparingTo("2000");
        assertThat(r.transferencia()).isEqualByComparingTo("3000");
        assertThat(r.mercadopago()).isEqualByComparingTo("4000");
        assertThat(r.cantidadCobros()).isEqualTo(3);

        assertThat(caja.balance(DIA.minusDays(1), DIA.plusDays(1)).cantidadCobros()).isEqualTo(5);
    }

    @Test
    @Transactional
    @DisplayName("un rango al revés o de más de un año se rechaza con un mensaje que se entiende")
    void rangoInvalido() {
        assertThatThrownBy(() -> caja.balance(DIA, DIA.minusDays(1)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("anterior");
        assertThatThrownBy(() -> caja.balance(DIA, DIA.plusDays(500)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("un año");
        assertThatThrownBy(() -> reportes.reporte(null, DIA))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @Transactional
    @DisplayName("⭐ el reporte del día: cada cobro con quién lo cobró, los gastos y el cierre")
    void elReporteDelDia() {
        cajera = crearCajera("Carla");
        cobrar(DIA.atTime(9, 0), "2000", "cash", "paid", cajera);
        cobrar(DIA.atTime(15, 0), "3000", "transfer", "paid", null);
        cobrar(DIA.atTime(10, 0), "9999", "cash", "pending", null);  // pendiente: no entró plata
        // Historial de ControlFit del mismo día: suma en el tablero, no en la caja (ADR-014).
        importador.importar(new Pedido("historial.xlsx", List.of(
                new Fila(2, "10/03/2026", "12:00", "Otro", "", "Cuota", "Efectivo", "7777", null, null))));

        caja.cerrar(BigDecimal.ZERO, null, "Carla");
        caja.registrar("EGRESO", "Limpieza", "Productos", new BigDecimal("500"), "CASH", "Carla");
        caja.registrar("EGRESO", "Proveedor", "Agua, factura 4412", new BigDecimal("700"), "TRANSFER", "Carla");
        caja.registrar("INGRESO", "Venta", null, new BigDecimal("100"), "CASH", "Carla");
        var mal = caja.registrar("EGRESO", "Otro", "cargado dos veces", new BigDecimal("999"), "CASH", "Carla");
        caja.anular(mal.getId(), "Duplicado", "Carla");
        // Todo lo de la caja al día fijo: se registró "ahora", que es otro día.
        em.flush();
        em.createNativeQuery("UPDATE caja_movimiento SET fecha = :f WHERE tenant_id = :t")
                .setParameter("f", DIA.atTime(18, 0)).setParameter("t", gym).executeUpdate();
        em.createNativeQuery("UPDATE caja_cierre SET desde = :d, hasta = :h WHERE tenant_id = :t")
                .setParameter("d", DIA.atStartOfDay()).setParameter("h", DIA.atTime(21, 0))
                .setParameter("t", gym).executeUpdate();
        em.clear();

        CajaReporteService.Reporte rep = reportes.reporte(DIA, DIA);

        assertThat(rep.gimnasio()).isEqualTo("Gimnasio Reporte");
        assertThat(rep.cobros()).hasSize(2);
        var primero = rep.cobros().get(0);
        assertThat(primero.fecha()).as("en orden del día").isEqualTo(DIA.atTime(9, 0));
        assertThat(primero.socio()).isEqualTo("Lucía Pereyra");
        assertThat(primero.dni()).isEqualTo("30111222");
        assertThat(primero.cobradoPor()).isEqualTo("Carla");
        assertThat(primero.periodoDesde()).isEqualTo(DIA);
        assertThat(primero.periodoHasta()).isEqualTo(DIA.plusMonths(1));
        assertThat(rep.cobros().get(1).metodo()).isEqualTo("transfer");

        var t = rep.totales();
        assertThat(t.efectivo()).isEqualByComparingTo("2000");
        assertThat(t.transferencia()).isEqualByComparingTo("3000");
        assertThat(t.cobrado()).as("sin el pendiente ni el importado").isEqualByComparingTo("5000");
        assertThat(t.cantidadCobros()).isEqualTo(2);
        assertThat(t.egresosEfectivo()).as("el anulado no resta").isEqualByComparingTo("500");
        assertThat(t.egresosOtros()).as("lo pagado por transferencia también es un gasto").isEqualByComparingTo("700");
        assertThat(t.ingresosEfectivo()).isEqualByComparingTo("100");
        assertThat(t.neto()).isEqualByComparingTo("3900");

        assertThat(rep.movimientos()).as("el anulado se ve, tachado").hasSize(4)
                .filteredOn(CajaReporteService.MovimientoDelReporte::anulado).hasSize(1);
        assertThat(rep.cierres()).hasSize(1);
        assertThat(rep.cierres().get(0).cerradoPor()).isEqualTo("Carla");
        assertThat(rep.cierres().get(0).retiro()).isEqualByComparingTo("0");
    }

    private void cobrar(LocalDateTime cuando, String monto, String metodo, String estado, UUID porCajero) {
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, period_start, period_end, performed_by_cashier_id,
                                          created_at, updated_at)
                VALUES (:id, :t, :m, :monto, :metodo, :estado, :cuando, :desde, :hasta, :cajero, now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("t", gym)
                .setParameter("m", socio)
                .setParameter("monto", new BigDecimal(monto))
                .setParameter("metodo", metodo)
                .setParameter("estado", estado)
                .setParameter("cuando", cuando)
                .setParameter("desde", cuando.toLocalDate().atStartOfDay())
                .setParameter("hasta", cuando.toLocalDate().plusMonths(1).atStartOfDay())
                .setParameter("cajero", porCajero)
                .executeUpdate();
    }

    private UUID crearCajera(String nombre) {
        Cashier c = new Cashier();
        c.setTenant(em.getReference(Tenant.class, gym));
        c.setName(nombre);
        c.setPinHash("$2a$10$abcdefghijklmnopqrstuv");
        em.persist(c);
        em.flush();
        return c.getId();
    }
}
