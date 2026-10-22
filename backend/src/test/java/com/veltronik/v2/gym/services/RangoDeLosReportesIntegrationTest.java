package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessLog;
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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lo que bajan los reportes es EXACTAMENTE el rango elegido: ni un cobro ni una entrada del día
 * de antes o del de después. Las horas son las del gimnasio (Argentina): así las guarda la base.
 *
 * <p>Con días FIJOS del pasado y no con "hoy": un test de fechas relativas a now() se cae solo de
 * madrugada, y ya pasó tres veces en este proyecto.</p>
 *
 * <p>🔴 La asistencia pedía hasta {@code LocalTime.MAX} (23:59:59.999999999). Postgres guarda
 * microsegundos y lo redondea a las 00:00 del día siguiente: la entrada de la medianoche en punto
 * del 1° de octubre aparecía en el reporte de septiembre. Es el mismo error que ya tuvo la lista
 * de Pagos.</p>
 */
@DisplayName("El rango de los reportes")
class RangoDeLosReportesIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private EntityManager em;
    @Autowired private CajaReporteService reportes;
    @Autowired private AccessLogService accesos;

    private static final LocalDate PRIMERO = LocalDate.of(2026, 9, 1);
    private static final LocalDate ULTIMO = LocalDate.of(2026, 9, 30);

    /** Las puntas: el día de antes, el primero, el último y el día de después. */
    private static final List<LocalDateTime> MOMENTOS = List.of(
            LocalDateTime.of(2026, 8, 31, 23, 59, 59),          // afuera: agosto
            PRIMERO.atStartOfDay(),                             // adentro: el primer instante
            ULTIMO.atTime(23, 30),                              // adentro: tarde del último día
            ULTIMO.atTime(23, 59, 59, 999_999_000),             // adentro: el último microsegundo
            LocalDateTime.of(2026, 10, 1, 0, 0),                // afuera: medianoche en punto
            LocalDateTime.of(2026, 10, 1, 0, 10));              // afuera: 00:10 del día siguiente

    private static final List<LocalDateTime> DE_SEPTIEMBRE = List.of(
            PRIMERO.atStartOfDay(), ULTIMO.atTime(23, 30), ULTIMO.atTime(23, 59, 59, 999_999_000));

    private UUID gym;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio Rango', true)
                """).setParameter("id", gym).executeUpdate();
        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Lucía', 'Pereyra', '', '30111222', true, now(), now(), now())
                """).setParameter("id", socio).setParameter("t", gym).executeUpdate();
        TenantContextHolder.setTenantId(gym);
        for (LocalDateTime cuando : MOMENTOS) {
            cobrar(cuando);
            entrar(cuando);
        }
        em.flush();
        em.clear();
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    @Test
    @Transactional
    @DisplayName("⭐ el Excel de septiembre trae septiembre: 23:30 del 30 adentro, 00:10 del 1° de octubre afuera")
    void elExcelDelMes() {
        CajaReporteService.Reporte rep = reportes.reporte(PRIMERO, ULTIMO);

        assertThat(rep.desde()).isEqualTo(PRIMERO);
        assertThat(rep.hasta()).isEqualTo(ULTIMO);
        assertThat(rep.cobros()).extracting(CajaReporteService.CobroDelReporte::fecha)
                .containsExactlyElementsOf(DE_SEPTIEMBRE);
        assertThat(rep.totales().cantidadCobros()).isEqualTo(3);
    }

    @Test
    @Transactional
    @DisplayName("un día solo: el último día del mes, hasta su último microsegundo")
    void unDiaSolo() {
        CajaReporteService.Reporte rep = reportes.reporte(ULTIMO, ULTIMO);

        assertThat(rep.cobros()).extracting(CajaReporteService.CobroDelReporte::fecha)
                .containsExactly(ULTIMO.atTime(23, 30), ULTIMO.atTime(23, 59, 59, 999_999_000));
    }

    @Test
    @Transactional
    @DisplayName("⭐ la asistencia de septiembre no se lleva la entrada de la medianoche del 1° de octubre")
    void laAsistenciaDelMes() {
        assertThat(accesos.getAccessesByDateRange(PRIMERO, ULTIMO)).extracting(AccessLog::getCheckInAt)
                .containsExactlyInAnyOrderElementsOf(DE_SEPTIEMBRE);
        assertThat(accesos.getAccessesByDateRange(ULTIMO.plusDays(1), ULTIMO.plusDays(1)))
                .extracting(AccessLog::getCheckInAt)
                .containsExactlyInAnyOrder(LocalDateTime.of(2026, 10, 1, 0, 0), LocalDateTime.of(2026, 10, 1, 0, 10));
    }

    private void cobrar(LocalDateTime cuando) {
        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :monto, 'CASH', 'paid', :cuando, now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("t", gym)
                .setParameter("m", socio)
                .setParameter("monto", new BigDecimal("1000"))
                .setParameter("cuando", cuando)
                .executeUpdate();
    }

    private void entrar(LocalDateTime cuando) {
        em.createNativeQuery("""
                INSERT INTO access_log (id, tenant_id, member_id, check_in_at, access_method, created_at, updated_at)
                VALUES (:id, :t, :s, :cuando, 'QR', now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("t", gym)
                .setParameter("s", socio)
                .setParameter("cuando", cuando)
                .executeUpdate();
    }
}
