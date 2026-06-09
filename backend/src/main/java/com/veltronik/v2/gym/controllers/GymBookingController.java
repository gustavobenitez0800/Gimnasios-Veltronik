package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymBookingDTO;
import com.veltronik.v2.gym.dto.GymBookingInputDTO;
import com.veltronik.v2.gym.mappers.GymBookingMapper;
import com.veltronik.v2.gym.services.GymBookingService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * API REST de reservas de clases del gimnasio.
 *
 * Devuelve SIEMPRE {@link GymBookingDTO} (nunca la entidad JPA cruda) y la ENTRADA usa
 * {@link GymBookingInputDTO} validado (no un Map sin tipar). Mismo patrón que el resto
 * del vertical: el frontend solo dibuja el contrato del DTO.
 */
@RestController
@RequestMapping("/api/gym/classes")
public class GymBookingController {

    private final GymBookingService bookingService;
    private final GymBookingMapper bookingMapper;

    public GymBookingController(GymBookingService bookingService, GymBookingMapper bookingMapper) {
        this.bookingService = bookingService;
        this.bookingMapper = bookingMapper;
    }

    @GetMapping("/{classId}/bookings")
    public ResponseEntity<List<GymBookingDTO>> getBookingsForClass(
            @PathVariable UUID classId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(bookingMapper.toDtoList(bookingService.getBookingsForClassAndDate(classId, date)));
    }

    @PostMapping("/{classId}/bookings")
    public ResponseEntity<GymBookingDTO> createBooking(
            @PathVariable UUID classId,
            @Valid @RequestBody GymBookingInputDTO input) {
        return ResponseEntity.ok(bookingMapper.toDto(
                bookingService.createBooking(classId, input.getMemberId(), input.getBookingDate())));
    }

    @DeleteMapping("/bookings/{bookingId}")
    public ResponseEntity<Void> deleteBooking(@PathVariable UUID bookingId) {
        bookingService.deleteBooking(bookingId);
        return ResponseEntity.noContent().build();
    }
}
