package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtBooking;
import com.veltronik.v2.courts.entities.CourtBookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface CourtBookingRepository extends JpaRepository<CourtBooking, UUID> {

    /**
     * Turnos del día para la grilla (incluye cancelados/expirados: el front decide qué pintar).
     *
     * <p><b>PERF (latencia us-east ↔ São Paulo ~120ms/query):</b> JOIN FETCH de cancha y
     * cliente — sin esto, los EAGER de la entidad disparan un select POR turno (N+1) y la
     * grilla pagaba segundos. Con el fetch: 1 sola query.</p>
     */
    @Query("""
            SELECT b FROM CourtBooking b
            JOIN FETCH b.court
            LEFT JOIN FETCH b.customer
            WHERE b.tenant.id = :tenantId
              AND b.startAt >= :from
              AND b.startAt < :to
            ORDER BY b.startAt ASC
            """)
    List<CourtBooking> findGridBookings(@Param("tenantId") UUID tenantId,
                                        @Param("from") LocalDateTime from,
                                        @Param("to") LocalDateTime to);

    /** Fechas/horas ya materializadas de un turno fijo (1 query para el chequeo en memoria). */
    @Query("SELECT b.startAt FROM CourtBooking b WHERE b.recurring.id = :recurringId")
    List<LocalDateTime> findStartAtsByRecurringId(@Param("recurringId") UUID recurringId);

    /**
     * Rangos [startAt, endAt) de turnos VIVOS de una cancha en una ventana, sin cargar
     * entidades (evita los EAGER): 1 query para validar solapamientos en memoria.
     */
    @Query("""
            SELECT b.startAt, b.endAt FROM CourtBooking b
            WHERE b.court.id = :courtId
              AND b.status NOT IN (com.veltronik.v2.courts.entities.CourtBookingStatus.CANCELLED,
                                   com.veltronik.v2.courts.entities.CourtBookingStatus.EXPIRED)
              AND b.startAt < :to
              AND b.endAt > :from
            """)
    List<Object[]> findAliveSlotRanges(@Param("courtId") UUID courtId,
                                       @Param("from") LocalDateTime from,
                                       @Param("to") LocalDateTime to);

    /**
     * ¿Hay un turno VIVO que se solape con [startAt, endAt) en esta cancha?
     * Chequeo de cortesía pre-insert (mensaje claro); la garantía real contra races
     * la da el índice único parcial de la BD.
     *
     * <p>Dos variantes (crear / mover) en lugar de un {@code :excludeId} nullable:
     * el patrón {@code :param IS NULL OR ...} puede fallar en runtime con PostgreSQL
     * según cómo se bindee el null — Cero Margen de Error.</p>
     */
    @Query("""
            SELECT COUNT(b) > 0 FROM CourtBooking b
            WHERE b.court.id = :courtId
              AND b.status NOT IN (com.veltronik.v2.courts.entities.CourtBookingStatus.CANCELLED,
                                   com.veltronik.v2.courts.entities.CourtBookingStatus.EXPIRED)
              AND b.startAt < :endAt
              AND b.endAt > :startAt
            """)
    boolean existsOverlapping(@Param("courtId") UUID courtId,
                              @Param("startAt") LocalDateTime startAt,
                              @Param("endAt") LocalDateTime endAt);

    /** Variante para mover un turno: ignora al propio turno. */
    @Query("""
            SELECT COUNT(b) > 0 FROM CourtBooking b
            WHERE b.court.id = :courtId
              AND b.status NOT IN (com.veltronik.v2.courts.entities.CourtBookingStatus.CANCELLED,
                                   com.veltronik.v2.courts.entities.CourtBookingStatus.EXPIRED)
              AND b.startAt < :endAt
              AND b.endAt > :startAt
              AND b.id <> :excludeId
            """)
    boolean existsOverlappingExcluding(@Param("courtId") UUID courtId,
                                       @Param("startAt") LocalDateTime startAt,
                                       @Param("endAt") LocalDateTime endAt,
                                       @Param("excludeId") UUID excludeId);

    /** Señas vencidas a liberar por el cron (corre SIN contexto de tenant: barre todos). */
    List<CourtBooking> findByStatusAndExpiresAtBefore(CourtBookingStatus status, LocalDateTime now);

    /** ¿El turno fijo ya está materializado en esta fecha/hora? (para el job idempotente). */
    boolean existsByRecurringIdAndStartAt(UUID recurringId, LocalDateTime startAt);

    /** Futuras instancias VIVAS de un turno fijo (para cancelarlas si se da de baja la plantilla). */
    @Query("""
            SELECT b FROM CourtBooking b
            WHERE b.recurring.id = :recurringId
              AND b.startAt > :now
              AND b.status NOT IN (com.veltronik.v2.courts.entities.CourtBookingStatus.CANCELLED,
                                   com.veltronik.v2.courts.entities.CourtBookingStatus.EXPIRED,
                                   com.veltronik.v2.courts.entities.CourtBookingStatus.COMPLETED)
            """)
    List<CourtBooking> findFutureAliveByRecurringId(@Param("recurringId") UUID recurringId,
                                                    @Param("now") LocalDateTime now);
}
