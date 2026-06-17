package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.*;
import com.veltronik.v2.courts.entities.CourtPaymentMethod;
import com.veltronik.v2.courts.mappers.CourtsMapper;
import com.veltronik.v2.courts.services.CourtBookingService;
import com.veltronik.v2.courts.services.CourtService;
import com.veltronik.v2.courts.services.CourtSettingsService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.UUID;

/**
 * API REST de turnos. El endpoint estrella es {@code GET /grid?date=} — un solo
 * round-trip con todo lo que la grilla necesita (config + canchas + turnos del día).
 */
@RestController
@RequestMapping("/api/courts/bookings")
public class CourtBookingController {

    private final CourtBookingService bookingService;
    private final CourtService courtService;
    private final CourtSettingsService settingsService;
    private final CourtsMapper mapper;

    public CourtBookingController(CourtBookingService bookingService,
                                  CourtService courtService,
                                  CourtSettingsService settingsService,
                                  CourtsMapper mapper) {
        this.bookingService = bookingService;
        this.courtService = courtService;
        this.settingsService = settingsService;
        this.mapper = mapper;
    }

    /** La grilla del día completa. {@code date} en formato ISO (yyyy-MM-dd); default hoy. */
    @GetMapping("/grid")
    public ResponseEntity<CourtGridDTO> getGrid(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate day = (date != null) ? date : LocalDate.now();
        CourtGridDTO grid = new CourtGridDTO();
        grid.setDate(day.toString());
        grid.setSettings(mapper.toDto(settingsService.getOrCreateForCurrentTenant()));
        grid.setCourts(mapper.toCourtDtoList(courtService.findActiveForCurrentTenant()));
        grid.setBookings(mapper.toBookingDtoList(bookingService.findByDateForCurrentTenant(day)));
        return ResponseEntity.ok(grid);
    }

    /** Resumen del día (barra de la grilla + caja): turnos, ocupación, plata cobrada/pendiente. */
    @GetMapping("/summary")
    public ResponseEntity<CourtDaySummaryDTO> summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate day = (date != null) ? date : LocalDate.now();
        return ResponseEntity.ok(bookingService.daySummary(day));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourtBookingDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(bookingService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<CourtBookingDTO> create(@Valid @RequestBody CourtBookingInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(bookingService.create(input)));
    }

    /** Edición de datos (precio/seña/notas/cliente). Cancha y horario van por /move. */
    @PutMapping("/{id}")
    public ResponseEntity<CourtBookingDTO> update(@PathVariable UUID id,
                                                  @RequestBody CourtBookingInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(bookingService.update(id, input)));
    }

    /** Drag & drop de la grilla. 409 si el slot destino está ocupado. */
    @PatchMapping("/{id}/move")
    public ResponseEntity<CourtBookingDTO> move(@PathVariable UUID id,
                                                @Valid @RequestBody CourtBookingMoveDTO moveTo) {
        return ResponseEntity.ok(mapper.toDto(bookingService.move(id, moveTo)));
    }

    // ─── transiciones de estado ───

    /** Seña recibida → CONFIRMED. El body (método de cobro) es opcional. */
    @PostMapping("/{id}/confirm")
    public ResponseEntity<CourtBookingDTO> confirm(@PathVariable UUID id,
                                                   @RequestBody(required = false) CourtBookingConfirmDTO body) {
        CourtPaymentMethod method = parseMethod(body != null ? body.getMethod() : null);
        return ResponseEntity.ok(mapper.toDto(bookingService.confirm(id, method)));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<CourtBookingDTO> cancel(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(bookingService.cancel(id)));
    }

    /** El turno se jugó → COMPLETED. El body (saldo cobrado + método) es opcional. */
    @PostMapping("/{id}/complete")
    public ResponseEntity<CourtBookingDTO> complete(@PathVariable UUID id,
                                                    @RequestBody(required = false) CourtBookingCompleteDTO body) {
        CourtPaymentMethod method = parseMethod(body != null ? body.getMethod() : null);
        return ResponseEntity.ok(mapper.toDto(
                bookingService.complete(id, body != null ? body.getAmountPaid() : null, method)));
    }

    /** El equipo no vino → NO_SHOW (suma al contador del cliente). */
    @PostMapping("/{id}/no-show")
    public ResponseEntity<CourtBookingDTO> noShow(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(bookingService.noShow(id)));
    }

    /** Método de cobro: null/vacío → el service usa efectivo; texto inválido → 400. */
    private static CourtPaymentMethod parseMethod(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return CourtPaymentMethod.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Método de pago inválido: " + raw);
        }
    }
}
