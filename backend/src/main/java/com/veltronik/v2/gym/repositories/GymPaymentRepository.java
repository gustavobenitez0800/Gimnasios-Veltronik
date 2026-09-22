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

    /**
     * El cobro que ya se guardó con ese sello, si existe.
     *
     * <p>Es la mitad barata de la idempotencia: se consulta ANTES de tocar nada, para no
     * ejecutar el efecto lateral —extender la cobertura del socio— por segunda vez. La otra
     * mitad, la que de verdad garantiza, es el índice único parcial de la V63: entre este
     * SELECT y el INSERT hay una ventana, y dos vaciados en paralelo pasan por ella.</p>
     */
    java.util.Optional<GymPayment> findByTenantIdAndClientRef(UUID tenantId, UUID clientRef);
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
     * <p>⚠️ <b>Solo hasta el mes en curso</b> ({@code hasta} = el 1° del mes que viene). Un
     * cobro con la fecha mal tipeada en el futuro —"2027" en vez de "2026"— estiraba la serie
     * hasta ese mes, la predicción rellenaba con ceros los meses del medio y anunciaba un
     * derrumbe que no existía.</p>
     *
     * @return filas [mes (timestamp del día 1), total]
     */
    @Query(value = """
            SELECT date_trunc('month', p.payment_date) AS mes,
                   COALESCE(SUM(p.amount), 0)          AS total
            FROM gym_payment p
            WHERE p.tenant_id = :tenantId
              AND LOWER(p.status) = 'paid'
              AND p.payment_date IS NOT NULL
              AND p.payment_date < :hasta
            GROUP BY 1
            ORDER BY 1
            """, nativeQuery = true)
    List<Object[]> ingresosPorMes(@Param("tenantId") UUID tenantId, @Param("hasta") LocalDateTime hasta);

    /**
     * Lo cobrado en {@code [desde, hasta)}. Es la mitad de la comparación honesta del mes en
     * curso: el 21 de septiembre se compara contra el 1 al 21 de agosto, no contra agosto entero.
     *
     * <p><b>UPPER(p.status) y no {@code p.status = 'PAID'}.</b> Convivieron {@code "PAID"} (el
     * default viejo de la entidad) y {@code "paid"} (lo que guarda la app), y la comparación
     * exacta que tenía la suma vieja no contaba ni un solo cobro cargado desde la app. Hoy el
     * estado se normaliza al guardar, pero los que ya están en la base quedaron como quedaron.</p>
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM GymPayment p WHERE p.tenant.id = :tenantId "
            + "AND p.paymentDate >= :desde AND p.paymentDate < :hasta AND UPPER(p.status) = 'PAID'")
    BigDecimal sumarCobradoEntre(@Param("tenantId") UUID tenantId,
                                 @Param("desde") LocalDateTime desde,
                                 @Param("hasta") LocalDateTime hasta);

    /**
     * El primer cobro del gimnasio. Dice si su primer mes está completo: el que empezó a cobrar
     * un 20 tiene un primer mes de diez días, y contarlo como un mes entero inventa un
     * crecimiento que no pasó.
     */
    @Query("SELECT MIN(p.paymentDate) FROM GymPayment p WHERE p.tenant.id = :tenantId AND UPPER(p.status) = 'PAID'")
    LocalDateTime primerCobro(@Param("tenantId") UUID tenantId);

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
            + "AND p.importId IS NULL "
            + "GROUP BY m.id, m.firstName, m.lastName, m.membershipEnd "
            + "HAVING m.membershipEnd IS NULL OR MAX(p.periodEnd) > m.membershipEnd "
            + "ORDER BY MAX(p.periodEnd) DESC")
    List<CoverageGapProjection> findCoverageGaps(@Param("tenantId") UUID tenantId);

    /**
     * Hasta cuándo pagó realmente un socio (el período más lejano entre sus pagos cobrados).
     *
     * <p>Ni esta ni {@link #findCoverageGaps} miran el historial importado (ADR-014): un cobro
     * de ControlFit no cubre ningún período. La V86 ya lo garantiza —un importado no puede
     * tener {@code period_end}—, y el filtro lo dice donde se lee.</p>
     */
    @Query("SELECT MAX(p.periodEnd) FROM GymPayment p WHERE p.tenant.id = :tenantId "
            + "AND p.member.id = :memberId AND UPPER(p.status) = 'PAID' AND p.periodEnd IS NOT NULL "
            + "AND p.importId IS NULL")
    LocalDateTime findPaidUntil(@Param("tenantId") UUID tenantId, @Param("memberId") UUID memberId);

    // ── El historial importado (V86, ADR-014) ─────────────────────────────────────

    /** Las claves de todas las filas ya importadas del gimnasio: lo que ya está no se vuelve a cargar. */
    @Query("SELECT p.importClave FROM GymPayment p WHERE p.tenant.id = :tenantId AND p.importClave IS NOT NULL")
    List<String> clavesImportadas(@Param("tenantId") UUID tenantId);

    /**
     * Los cobros hechos EN VELTRONIK en un rango, con su socio: para no importar como historia
     * un cobro que ya se registró acá (el mismo socio, el mismo día, el mismo monto).
     */
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId "
            + "AND p.importId IS NULL AND p.paymentDate >= :from AND p.paymentDate <= :to")
    List<GymPayment> cobrosDeVeltronikEntre(@Param("tenantId") UUID tenantId,
                                            @Param("from") LocalDateTime from,
                                            @Param("to") LocalDateTime to);

    /** Cuántos cobros de una importación se editaron después de importarla. */
    @Query("SELECT COUNT(p) FROM GymPayment p WHERE p.importId = :importId AND p.updatedAt > :despuesDe")
    long editadosDespuesDe(@Param("importId") UUID importId, @Param("despuesDe") LocalDateTime despuesDe);

    /** Deshacer una importación de historial: se van los cobros que trajo, y solo esos. */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM GymPayment p WHERE p.tenant.id = :tenantId AND p.importId = :importId")
    int borrarLosDeUnaImportacion(@Param("tenantId") UUID tenantId, @Param("importId") UUID importId);

    /** Proyección de {@link #findCoverageGaps}: solo lo que la pantalla de revisión necesita. */
    interface CoverageGapProjection {
        UUID getMemberId();
        String getFirstName();
        String getLastName();
        LocalDateTime getMembershipEnd();
        LocalDateTime getPaidUntil();
    }
}
