package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPayment;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface GymPaymentRepository extends JpaRepository<GymPayment, UUID> {
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member LEFT JOIN FETCH p.plan WHERE p.tenant.id = :tenantId ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantId(@Param("tenantId") UUID tenantId);

    /** Últimos pagos del tenant (límite en BD por Pageable — para feeds/actividad, no cargar el historial entero). */
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member LEFT JOIN FETCH p.plan WHERE p.tenant.id = :tenantId ORDER BY p.paymentDate DESC")
    List<GymPayment> findRecentByTenantId(@Param("tenantId") UUID tenantId, Pageable pageable);

    /**
     * Pagos del tenant en el rango [from, to] (ambos inclusivos). {@code from}/{@code to}
     * llegan SIEMPRE no-null desde el service (pone bordes centinela si el usuario no acota
     * un extremo). El query es un {@code >= AND <=} limpio a propósito: el patrón anterior
     * '({@code :param} IS NULL OR ...)' tiraba una JDBC exception en Hibernate 6 + PostgreSQL
     * (no podía inferir el tipo del bind-parameter dentro del IS NULL) → HTTP 400, que dejaba
     * Pagos y Reportes EN BLANCO con cualquier filtro de fecha.
     */
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member LEFT JOIN FETCH p.plan WHERE p.tenant.id = :tenantId "
            + "AND p.paymentDate >= :from AND p.paymentDate <= :to "
            + "ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantIdAndDateRange(@Param("tenantId") UUID tenantId,
                                                @Param("from") LocalDateTime from,
                                                @Param("to") LocalDateTime to);

    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member LEFT JOIN FETCH p.plan WHERE p.tenant.id = :tenantId AND p.member.id = :memberId ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantIdAndMemberId(@Param("tenantId") UUID tenantId, @Param("memberId") UUID memberId);
    
    /**
     * Ingresos del gimnasio desde una fecha (el "cobrado este mes" del Dashboard).
     *
     * <p><b>UPPER(p.status) y no {@code p.status = 'PAID'}.</b> La comparación exacta que
     * había acá estaba rota de verdad: la entidad nace con {@code "PAID"} pero el frontend
     * guarda {@code "paid"} en minúscula, y nadie normalizaba. O sea que esta suma
     * <b>no contaba ni un solo pago cargado desde la app</b> — el dueño miraba un número
     * de ingresos que no incluía su facturación real.</p>
     *
     * <p>Desde ahora el estado se guarda normalizado (ver {@code GymPaymentService}), pero
     * la consulta sigue siendo insensible a mayúsculas a propósito: los pagos que ya están
     * en la base quedaron con la caja que les tocó, y tienen que contar igual.</p>
     */
    /**
     * Ingresos cobrados por MES, agrupados en la base.
     *
     * <p>⭐ Existe para que el Dashboard deje de traerse TODOS los pagos del gimnasio y
     * sumarlos en el navegador. Con un año de operación eso son miles de filas viajando por
     * la conexión del gimnasio cada vez que alguien abre la pantalla, para pintar seis
     * barras. Acá vuelven seis renglones.</p>
     *
     * <p>Nativa y no JPQL porque necesita {@code date_trunc}, que JPQL no tiene. El corte de
     * mes lo hace Postgres sobre el timestamp naive, que ya está en hora de Argentina.</p>
     *
     * @return filas [mes (timestamp del día 1), total]
     */
    @Query(value = """
            SELECT date_trunc('month', p.payment_date) AS mes,
                   COALESCE(SUM(p.amount), 0)          AS total
            FROM gym_payments p
            WHERE p.tenant_id = :tenantId
              AND LOWER(p.status) = 'paid'
              AND p.payment_date IS NOT NULL
            GROUP BY 1
            ORDER BY 1
            """, nativeQuery = true)
    List<Object[]> ingresosPorMes(@Param("tenantId") UUID tenantId);

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM GymPayment p WHERE p.tenant.id = :tenantId "
            + "AND p.paymentDate >= :startDate AND UPPER(p.status) = 'PAID'")
    BigDecimal sumAmountByTenantIdAndDateAfter(@Param("tenantId") UUID tenantId, @Param("startDate") LocalDateTime startDate);

    /**
     * Socios que PAGARON más allá de la fecha hasta la que figuran cubiertos.
     *
     * <p>Son los restos del bug de los dos pasos: el pago entraba y la request que le
     * corría el vencimiento al socio fallaba en silencio. Con el mecanismo ya arreglado
     * esto no debería crecer más, pero lo que quedó en la base sigue ahí — y cuenta como
     * "baja" en cualquier reporte, cuando en realidad es alguien que pagó.</p>
     *
     * <p>Se agrupa por socio y se toma el período más lejano, no el último pago cargado:
     * si alguien registró primero septiembre y después una cuota vieja de marzo, lo que
     * vale es septiembre.</p>
     */
    @Query("SELECT m.id AS memberId, m.firstName AS firstName, m.lastName AS lastName, "
            + "m.membershipEnd AS membershipEnd, MAX(p.periodEnd) AS paidUntil "
            + "FROM GymPayment p JOIN p.member m "
            + "WHERE p.tenant.id = :tenantId AND UPPER(p.status) = 'PAID' AND p.periodEnd IS NOT NULL "
            + "GROUP BY m.id, m.firstName, m.lastName, m.membershipEnd "
            + "HAVING m.membershipEnd IS NULL OR MAX(p.periodEnd) > m.membershipEnd "
            + "ORDER BY MAX(p.periodEnd) DESC")
    List<CoverageGapProjection> findCoverageGaps(@Param("tenantId") UUID tenantId);

    /** Hasta cuándo pagó realmente un socio (el período más lejano entre sus pagos cobrados). */
    @Query("SELECT MAX(p.periodEnd) FROM GymPayment p WHERE p.tenant.id = :tenantId "
            + "AND p.member.id = :memberId AND UPPER(p.status) = 'PAID' AND p.periodEnd IS NOT NULL")
    LocalDateTime findPaidUntil(@Param("tenantId") UUID tenantId, @Param("memberId") UUID memberId);

    /** Proyección de {@link #findCoverageGaps}: solo lo que la pantalla de revisión necesita. */
    interface CoverageGapProjection {
        UUID getMemberId();
        String getFirstName();
        String getLastName();
        LocalDateTime getMembershipEnd();
        LocalDateTime getPaidUntil();
    }
}
