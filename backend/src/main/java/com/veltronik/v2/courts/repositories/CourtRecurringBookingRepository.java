package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtRecurringBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CourtRecurringBookingRepository extends JpaRepository<CourtRecurringBooking, UUID> {
    List<CourtRecurringBooking> findByTenantIdOrderByDayOfWeekAscStartTimeAsc(UUID tenantId);

    /** Para el job de materialización (corre sin contexto de tenant: barre todos). */
    List<CourtRecurringBooking> findByActiveTrue();
}
