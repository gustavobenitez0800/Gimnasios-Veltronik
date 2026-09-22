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
        cobrar(DIA.minusDays(1).atTime(23, 59, 59), "1000", "CASH", "paid", null);
        cobrar(DIA.atStartOfDay(), "2000", "CASH", "paid", null);
        cobrar(DIA.atTime(15, 0), "3000", "TRANSFER", "paid", null);
        // El último microsegundo del día es del día; las 00:00 del siguiente, no.
        cobrar(DIA.atTime(23, 59, 59, 999_999_000), "4000", "MERCADOPAGO", "paid", null);
        cobrar(DIA.plusDays(1).atStartOfDay(), "5000", "CASH", "paid", null);

        CajaService.Balance b = caja.balance(DIA, DIA);
        assertThat(b.ingresos().efectivo()).isEqualByComparingTo("2000");
        assertThat(b.ingresos().transferencia()).isEqualByComparingTo("3000");
        assertThat(b.ingresos().mercadopago()).isEqualByComparingTo("4000");
        assertThat(b.cantidadCobros()).isEqualTo(3);
        assertThat(b.total()).isEqualByComparingTo("9000");

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
        cobrar(DIA.atTime(9, 0), "2000", "CASH", "paid", cajera);
        cobrar(DIA.atTime(15, 0), "3000", "TRANSFER", "paid", null);
        cobrar(DIA.atTime(10, 0), "9999", "CASH", "pending", null);  // pendiente: no entró plata
        // Historial de ControlFit del mismo día: suma en los ingresos del período, MARCADO, y no
        // entra en ningún cierre de caja (ADR-014, decisión del 2026-09-22).
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
        assertThat(rep.cobros()).as("los dos de Veltronik y el importado; el pendiente no").hasSize(3);
        var primero = rep.cobros().get(0);
        assertThat(primero.fecha()).as("en orden del día").isEqualTo(DIA.atTime(9, 0));
        assertThat(primero.socio()).isEqualTo("Lucía Pereyra");
        assertThat(primero.dni()).isEqualTo("30111222");
        assertThat(primero.cobradoPor()).isEqualTo("Carla");
        assertThat(primero.periodoDesde()).isEqualTo(DIA);
        assertThat(primero.periodoHasta()).isEqualTo(DIA.plusMonths(1));
        assertThat(rep.cobros().get(1).importado()).as("el de ControlFit va marcado").isTrue();
        assertThat(primero.importado()).isFalse();
        assertThat(rep.cobros().get(2).metodo()).isEqualTo("TRANSFER");

        var t = rep.totales();
        assertThat(t.efectivo()).as("el importado fue en efectivo").isEqualByComparingTo("9777");
        assertThat(t.transferencia()).isEqualByComparingTo("3000");
        assertThat(t.cobrado()).as("sin el pendiente").isEqualByComparingTo("12777");
        assertThat(t.cuotas()).isEqualByComparingTo("5000");
        assertThat(t.historial()).isEqualByComparingTo("7777");
        assertThat(t.cantidadHistorial()).isEqualTo(1);
        assertThat(t.cantidadCobros()).isEqualTo(3);
        assertThat(t.egresosEfectivo()).as("el anulado no resta").isEqualByComparingTo("500");
        assertThat(t.egresosOtros()).as("lo pagado por transferencia también es un gasto").isEqualByComparingTo("700");
        assertThat(t.ingresosEfectivo()).isEqualByComparingTo("100");
        assertThat(t.ingresos()).as("cobros + la venta").isEqualByComparingTo("12877");
        assertThat(t.neto()).isEqualByComparingTo("11677");
        // ⭐ Y es el MISMO total que el libro de ingresos: lo que ve el dueño en la pantalla.
        assertThat(t.ingresos()).isEqualByComparingTo(caja.balance(DIA, DIA).total());

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
