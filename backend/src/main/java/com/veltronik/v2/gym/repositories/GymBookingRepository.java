package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface GymBookingRepository extends JpaRepository<GymBooking, UUID> {
    List<GymBooking> findByTenantId(UUID tenantId);
    List<GymBooking> findByTenantIdAndGymClassId(UUID tenantId, UUID classId);
    List<GymBooking> findByTenantIdAndGymClassIdAndBookingDate(UUID tenantId, UUID classId, LocalDate bookingDate);
    long countByTenantIdAndGymClassIdAndBookingDateAndStatus(UUID tenantId, UUID classId, LocalDate bookingDate, String status);
}
