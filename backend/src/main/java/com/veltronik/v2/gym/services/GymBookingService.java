package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.services.TenantContext;
import com.veltronik.v2.gym.entities.GymBooking;
import com.veltronik.v2.gym.entities.GymClass;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.GymBookingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class GymBookingService {

    private final GymBookingRepository bookingRepository;
    private final GymClassService classService;
    private final GymMemberService memberService;
    private final TenantContext tenantContext;

    public GymBookingService(GymBookingRepository bookingRepository, GymClassService classService, GymMemberService memberService, TenantContext tenantContext) {
        this.bookingRepository = bookingRepository;
        this.classService = classService;
        this.memberService = memberService;
        this.tenantContext = tenantContext;
    }

    public List<GymBooking> getBookingsForClassAndDate(UUID classId, LocalDate date) {
        return bookingRepository.findByTenantIdAndGymClassIdAndBookingDate(tenantContext.getCurrentTenantId(), classId, date);
    }

    @Transactional
    public GymBooking createBooking(UUID classId, UUID memberId, LocalDate date) {
        GymClass gymClass = classService.findByIdAndVerifyOwnership(classId);
        GymMember gymMember = memberService.findByIdAndVerifyOwnership(memberId);

        long currentBookings = bookingRepository.countByTenantIdAndGymClassIdAndBookingDateAndStatus(
                tenantContext.getCurrentTenantId(), classId, date, "CONFIRMED");

        if (currentBookings >= gymClass.getCapacity()) {
            throw new RuntimeException("La clase está llena para esta fecha.");
        }

        GymBooking booking = new GymBooking();
        booking.setTenant(tenantContext.getCurrentTenant());
        booking.setGymClass(gymClass);
        booking.setMember(gymMember);
        booking.setBookingDate(date);
        booking.setStatus("CONFIRMED");

        return bookingRepository.save(booking);
    }

    @Transactional
    public void deleteBooking(UUID bookingId) {
        GymBooking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Reserva no encontrada"));
        
        if (!booking.getTenant().getId().equals(tenantContext.getCurrentTenantId())) {
            throw new RuntimeException("Acceso denegado");
        }
        
        bookingRepository.delete(booking);
    }
}
