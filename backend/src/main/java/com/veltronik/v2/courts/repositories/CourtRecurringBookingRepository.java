package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtRecurringBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CourtRecurringBookingRepository extends JpaRepository<CourtRecurringBooking, UUID> {

    /** JOIN FETCH: sin esto los EAGER disparan un select por fila (N+1) — ver CourtBookingRepository. */
    @Query("""
            SELECT r FROM CourtRecurringBooking r
            JOIN FETCH r.court
            JOIN FETCH r.customer
            WHERE r.tenant.id = :tenantId
            ORDER BY r.dayOfWeek ASC, r.startTime ASC
            """)
    List<CourtRecurringBooking> findAllWithRelations(@Param("tenantId") UUID tenantId);

    /** Para el job de materialización (corre sin contexto de tenant: barre todos). */
    @Query("""
            SELECT r FROM CourtRecurringBooking r
            JOIN FETCH r.court
            JOIN FETCH r.customer
            WHERE r.active = true
            """)
    List<CourtRecurringBooking> findActiveWithRelations();
}
