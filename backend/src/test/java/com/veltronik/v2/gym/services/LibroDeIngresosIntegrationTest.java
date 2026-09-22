package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ⭐ El libro de ingresos: la única cuenta de "cuánta plata entró", contra Postgres de verdad.
 *
 * <p>Con días FIJOS del pasado y no con "hoy": un test de fechas relativas a now() se cae solo de
 * madrugada, y ya pasó varias veces en este proyecto.</p>
 */
@Transactional
@DisplayName("El libro de ingresos")
class LibroDeIngresosIntegrationTest extends EmbeddedPostgresTest {

    private static final LocalDate DIA = LocalDate.of(2026, 3, 10);

    @Autowired private EntityManager em;
    @Autowired private LibroDeIngresos libro;

    private UUID gym;

    @BeforeEach
    void sembrar() {
        gym = gimnasio("Gimnasio del libro");
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    @Test
    @DisplayName("⭐ cuenta cuotas, historial y ventas, y las dos cuentas (por medio y por origen) dan el mismo total")
    void lasDosCuentasSumanLoMismo() {
        cobro(gym, DIA.atTime(9, 0), "40000", "CASH", "paid", false);
        cobro(gym, DIA.atTime(10, 0), "45000", "TRANSFER", "paid", false);
        cobro(gym, DIA.atTime(11, 0), "30000", "MERCADOPAGO", "paid", false);
        cobro(gym, DIA.atTime(12, 0), "10000.50", "CARD", "paid", false);
        cobro(gym, DIA.atTime(13, 0), "7777", "CASH", "paid", true);          // historial importado
        movimiento(gym, DIA.atTime(14, 0), "INGRESO", "Venta", "3500", "CASH", false);
        movimiento(gym, DIA.atTime(15, 0), "INGRESO", "Venta", "8000", "TRANSFER", false);

        LibroDeIngresos.Totales t = libro.enLosDias(gym, DIA, DIA);

        assertThat(t.cuotas()).isEqualByComparingTo("125000.50");
        assertThat(t.historial()).isEqualByComparingTo("7777");
        assertThat(t.otrosIngresos()).isEqualByComparingTo("11500");
        assertThat(t.total()).isEqualByComparingTo("144277.50");
        assertThat(t.efectivo().add(t.transferencia()).add(t.mercadopago()).add(t.tarjeta()).add(t.otros()))
                .as("por forma de pago suma lo mismo que por origen, peso por peso (y centavo)")
                .isEqualByComparingTo(t.total());
        assertThat(t.efectivo()).isEqualByComparingTo("51277");
        assertThat(t.tarjeta()).as("los centavos no se redondean").isEqualByComparingTo("10000.50");
        assertThat(t.cantidadCuotas()).isEqualTo(4);
        assertThat(t.cantidadHistorial()).isEqualTo(1);
        assertThat(t.cantidadOtrosIngresos()).isEqualTo(2);
    }

    @Test
    @DisplayName("un pendiente, un anulado, un aporte o un retiro del dueño no son plata que entró")
    void loQueNoEsIngreso() {
        cobro(gym, DIA.atTime(9, 0), "40000", "CASH", "paid", false);
        cobro(gym, DIA.atTime(9, 30), "99999", "CASH", "pending", false);
        cobro(gym, DIA.atTime(9, 45), "55555", "CASH", "cancelled", false);
        movimiento(gym, DIA.atTime(10, 0), "INGRESO", "Aporte", "20000", "CASH", false);   // cambio que puso el dueño
        movimiento(gym, DIA.atTime(10, 5), "INGRESO", "  aporte ", "1000", "CASH", false);
        movimiento(gym, DIA.atTime(10, 10), "EGRESO", "Retiro", "5000", "CASH", false);
        movimiento(gym, DIA.atTime(10, 20), "EGRESO", "Limpieza", "3000", "CASH", false);   // un gasto no es ingreso
        UUID anulada = movimiento(gym, DIA.atTime(11, 0), "INGRESO", "Venta", "2000", "CASH", false);
        em.createNativeQuery("UPDATE caja_movimiento SET anulado_at = now() WHERE id = :id")
                .setParameter("id", anulada).executeUpdate();

        LibroDeIngresos.Totales t = libro.enLosDias(gym, DIA, DIA);

        assertThat(t.total()).isEqualByComparingTo("40000");
        assertThat(t.cantidadCobros()).isEqualTo(1);
        assertThat(t.cantidadOtrosIngresos()).isZero();
    }

    @Test
    @DisplayName("⭐ el rango es de días enteros: las 00:00 del día siguiente ya no son de hoy")
    void losBordesDelDia() {
        cobro(gym, DIA.minusDays(1).atTime(23, 59, 59, 999_999_000), "1", "CASH", "paid", false);
        cobro(gym, DIA.atStartOfDay(), "10", "CASH", "paid", false);
        cobro(gym, DIA.atTime(23, 59, 59, 999_999_000), "100", "CASH", "paid", false);
        cobro(gym, DIA.plusDays(1).atStartOfDay(), "1000", "CASH", "paid", false);

        assertThat(libro.enLosDias(gym, DIA, DIA).total()).isEqualByComparingTo("110");
        assertThat(libro.enLosDias(gym, DIA.minusDays(1), DIA.plusDays(1)).total()).isEqualByComparingTo("1111");
    }

    @Test
    @DisplayName("por mes: cada peso en su mes, y el total de los meses es el total del rango")
    void porMes() {
        cobro(gym, LocalDateTime.of(2026, 1, 31, 23, 59), "100", "CASH", "paid", false);
        cobro(gym, LocalDateTime.of(2026, 2, 1, 0, 0), "200", "CASH", "paid", false);
        cobro(gym, LocalDateTime.of(2026, 2, 15, 12, 0), "300", "TRANSFER", "paid", true);
        movimiento(gym, LocalDateTime.of(2026, 2, 20, 12, 0), "INGRESO", "Venta", "50", "CASH", false);

        var meses = libro.porMes(gym, LibroDeIngresos.DESDE_SIEMPRE, LocalDateTime.of(2026, 3, 1, 0, 0));

        assertThat(meses.keySet()).containsExactly(YearMonth.of(2026, 1), YearMonth.of(2026, 2));
        assertThat(meses.get(YearMonth.of(2026, 1)).total()).isEqualByComparingTo("100");
        assertThat(meses.get(YearMonth.of(2026, 2)).total()).isEqualByComparingTo("550");
        assertThat(meses.get(YearMonth.of(2026, 2)).historial()).isEqualByComparingTo("300");
        assertThat(meses.get(YearMonth.of(2026, 2)).otrosIngresos()).isEqualByComparingTo("50");
        assertThat(libro.entre(gym, LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(2026, 3, 1, 0, 0)).total())
                .isEqualByComparingTo("650");
        assertThat(libro.primerIngreso(gym)).isEqualTo(LocalDateTime.of(2026, 1, 31, 23, 59));
    }

    @Test
    @DisplayName("varias sucursales a la vez, cada una con lo suyo y nada de otro gimnasio")
    void variasSucursales() {
        UUID otra = gimnasio("Otra sucursal");
        UUID ajena = gimnasio("De otro dueño");
        cobro(gym, DIA.atTime(9, 0), "100", "CASH", "paid", false);
        cobro(otra, DIA.atTime(9, 0), "200", "CASH", "paid", false);
        cobro(ajena, DIA.atTime(9, 0), "999", "CASH", "paid", false);

        var r = libro.porMes(List.of(gym, otra), DIA.atStartOfDay(), DIA.plusDays(1).atStartOfDay());

        assertThat(r).containsOnlyKeys(gym, otra);
        assertThat(r.get(gym).get(YearMonth.from(DIA)).total()).isEqualByComparingTo("100");
        assertThat(r.get(otra).get(YearMonth.from(DIA)).total()).isEqualByComparingTo("200");
    }

    // ── Siembra ──────────────────────────────────────────────────────────────────

    private UUID gimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :n, true)
                """).setParameter("id", id).setParameter("n", nombre).executeUpdate();
        return id;
    }

    /** Un cobro. {@code importado} = del historial del sistema anterior (con su lote). */
    private void cobro(UUID tenant, LocalDateTime cuando, String monto, String metodo, String estado, boolean importado) {
        UUID lote = null;
        if (importado) {
            lote = UUID.randomUUID();
            em.createNativeQuery("""
                    INSERT INTO gym_payment_import (id, tenant_id, created_at, updated_at, aplicada_at)
                    VALUES (:id, :t, now(), now(), now())
                    """).setParameter("id", lote).setParameter("t", tenant).executeUpdate();
        }
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, amount, payment_method, status, payment_date,
                                          import_id, import_clave, created_at, updated_at)
                VALUES (:id, :t, :monto, :metodo, :estado, :cuando, :lote, :clave, now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", tenant)
                .setParameter("monto", new BigDecimal(monto)).setParameter("metodo", metodo)
                .setParameter("estado", estado).setParameter("cuando", cuando)
                .setParameter("lote", lote).setParameter("clave", importado ? UUID.randomUUID().toString() : null)
                .executeUpdate();
    }

    private UUID movimiento(UUID tenant, LocalDateTime cuando, String tipo, String categoria, String monto,
                            String metodo, boolean importado) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO caja_movimiento (id, tenant_id, tipo, categoria, detalle, monto, metodo, fecha,
                                              created_at, updated_at)
                VALUES (:id, :t, :tipo, :cat, 'detalle', :monto, :metodo, :cuando, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant).setParameter("tipo", tipo)
                .setParameter("cat", categoria).setParameter("monto", new BigDecimal(monto))
                .setParameter("metodo", metodo).setParameter("cuando", cuando)
                .executeUpdate();
        return id;
    }
}
