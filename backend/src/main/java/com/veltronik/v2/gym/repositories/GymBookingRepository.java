package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Reservas de clases.
 *
 * <p>OJO — feature a medio terminar: el backend está COMPLETO (entidad, servicio y
 * {@code GymBookingController} con listar/reservar/cancelar bajo
 * {@code /api/gym/classes/{id}/bookings}) pero <b>ninguna pantalla lo usa</b>: la app de gimnasio
 * no tiene UI de reservas. No es código muerto —anda y está testeado— es una feature que le falta
 * la mitad de arriba. Antes de sumarle métodos, construir la pantalla.</p>
 */
@Repository
public interface GymBookingRepository extends JpaRepository<GymBooking, UUID> {
    List<GymBooking> findByTenantIdAndGymClassIdAndBookingDate(UUID tenantId, UUID classId, LocalDate bookingDate);
    long countByTenantIdAndGymClassIdAndBookingDateAndStatus(UUID tenantId, UUID classId, LocalDate bookingDate, String status);
    boolean existsByTenantIdAndGymClassIdAndMemberIdAndBookingDate(UUID tenantId, UUID classId, UUID memberId, LocalDate bookingDate);
}
