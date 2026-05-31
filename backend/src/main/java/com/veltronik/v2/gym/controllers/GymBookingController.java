package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.entities.GymBooking;
import com.veltronik.v2.gym.services.GymBookingService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/classes")
public class GymBookingController {

    private final GymBookingService bookingService;

    public GymBookingController(GymBookingService bookingService) {
        this.bookingService = bookingService;
    }

    @GetMapping("/{classId}/bookings")
    public ResponseEntity<List<GymBooking>> getBookingsForClass(
            @PathVariable UUID classId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(bookingService.getBookingsForClassAndDate(classId, date));
    }

    @PostMapping("/{classId}/bookings")
    public ResponseEntity<GymBooking> createBooking(
            @PathVariable UUID classId,
            @RequestBody Map<String, Object> payload) {
        UUID memberId = UUID.fromString((String) payload.get("member_id"));
        LocalDate date = LocalDate.parse((String) payload.get("booking_date"));
        return ResponseEntity.ok(bookingService.createBooking(classId, memberId, date));
    }

    @DeleteMapping("/bookings/{bookingId}")
    public ResponseEntity<Void> deleteBooking(@PathVariable UUID bookingId) {
        bookingService.deleteBooking(bookingId);
        return ResponseEntity.noContent().build();
    }
}
