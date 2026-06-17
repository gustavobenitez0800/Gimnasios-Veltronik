package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtPublicAvailabilityDTO;
import com.veltronik.v2.courts.dto.CourtPublicBookInputDTO;
import com.veltronik.v2.courts.dto.CourtPublicBookResultDTO;
import com.veltronik.v2.courts.dto.CourtPublicVenueDTO;
import com.veltronik.v2.courts.services.CourtPublicService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * API PÚBLICA de reservas online (sin login). El complejo se resuelve por un token
 * impredecible. Va bajo /api/public/** (permitAll + excluido del KillSwitch). El service
 * valida que el complejo tenga las reservas online activas y aplica anti-abuso.
 */
@RestController
@RequestMapping("/api/public/courts")
public class CourtPublicController {

    private final CourtPublicService publicService;

    public CourtPublicController(CourtPublicService publicService) {
        this.publicService = publicService;
    }

    @GetMapping("/{token}")
    public ResponseEntity<CourtPublicVenueDTO> venue(@PathVariable String token) {
        return ResponseEntity.ok(publicService.venue(token));
    }

    @GetMapping("/{token}/availability")
    public ResponseEntity<CourtPublicAvailabilityDTO> availability(
            @PathVariable String token,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(publicService.availability(token, date != null ? date : LocalDate.now()));
    }

    @PostMapping("/{token}/book")
    public ResponseEntity<CourtPublicBookResultDTO> book(@PathVariable String token,
                                                         @Valid @RequestBody CourtPublicBookInputDTO input) {
        return ResponseEntity.ok(publicService.book(token, input));
    }
}
