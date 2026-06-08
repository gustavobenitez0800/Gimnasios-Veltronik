package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymBooking;
import com.veltronik.v2.gym.entities.GymClass;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.gym.repositories.GymBookingRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class GymBookingService {

    private final GymBookingRepository bookingRepository;
    private final GymClassService classService;
    private final GymMemberService memberService;

    public GymBookingService(GymBookingRepository bookingRepository, GymClassService classService, GymMemberService memberService) {
        this.bookingRepository = bookingRepository;
        this.classService = classService;
        this.memberService = memberService;
    }

    public List<GymBooking> getBookingsForClassAndDate(UUID classId, LocalDate date) {
        return bookingRepository.findByTenantIdAndGymClassIdAndBookingDate(TenantContextHolder.getTenantId(), classId, date);
    }

    @Transactional
    public GymBooking createBooking(UUID classId, UUID memberId, LocalDate date) {
        GymClass gymClass = classService.findByIdAndVerifyOwnership(classId);
        GymMember gymMember = memberService.findByIdAndVerifyOwnership(memberId);

        long currentBookings = bookingRepository.countByTenantIdAndGymClassIdAndBookingDateAndStatus(
                TenantContextHolder.getTenantId(), classId, date, "CONFIRMED");

        if (currentBookings >= gymClass.getCapacity()) {
            throw new BusinessException("La clase está llena para esta fecha.");
        }

        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());

        GymBooking booking = new GymBooking();
        booking.setTenant(tenant);
        booking.setGymClass(gymClass);
        booking.setMember(gymMember);
        booking.setBookingDate(date);
        booking.setStatus("CONFIRMED");

        return bookingRepository.save(booking);
    }

    @Transactional
    public void deleteBooking(UUID bookingId) {
        GymBooking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));

        if (!booking.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
        
        bookingRepository.delete(booking);
    }
}
