package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtRecurringBookingDTO;
import com.veltronik.v2.courts.dto.CourtRecurringBookingInputDTO;
import com.veltronik.v2.courts.entities.CourtRecurringBooking;
import com.veltronik.v2.courts.mappers.CourtsMapper;
import com.veltronik.v2.courts.services.CourtCustomerService;
import com.veltronik.v2.courts.services.CourtRecurringBookingService;
import com.veltronik.v2.courts.services.CourtService;
import com.veltronik.v2.courts.services.CourtSettingsService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** API REST de turnos fijos semanales. El alta materializa las próximas semanas al toque. */
@RestController
@RequestMapping("/api/courts/recurring")
public class CourtRecurringBookingController {

    private final CourtRecurringBookingService recurringService;
    private final CourtService courtService;
    private final CourtCustomerService customerService;
    private final CourtSettingsService settingsService;
    private final CourtsMapper mapper;

    public CourtRecurringBookingController(CourtRecurringBookingService recurringService,
                                           CourtService courtService,
                                           CourtCustomerService customerService,
                                           CourtSettingsService settingsService,
                                           CourtsMapper mapper) {
        this.recurringService = recurringService;
        this.courtService = courtService;
        this.customerService = customerService;
        this.settingsService = settingsService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<CourtRecurringBookingDTO>> getAll() {
        return ResponseEntity.ok(mapper.toRecurringDtoList(recurringService.findAllForCurrentTenant()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourtRecurringBookingDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(recurringService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<CourtRecurringBookingDTO> create(@Valid @RequestBody CourtRecurringBookingInputDTO input) {
        CourtRecurringBooking r = new CourtRecurringBooking();
        applyEditableFields(r, input);
        if (r.getValidFrom() == null) r.setValidFrom(LocalDate.now());
        return ResponseEntity.ok(mapper.toDto(recurringService.saveForCurrentTenant(r)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CourtRecurringBookingDTO> update(@PathVariable UUID id,
                                                           @Valid @RequestBody CourtRecurringBookingInputDTO input) {
        CourtRecurringBooking r = recurringService.findByIdAndVerifyOwnership(id);
        applyEditableFields(r, input);
        return ResponseEntity.ok(mapper.toDto(recurringService.saveForCurrentTenant(r)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        recurringService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    private void applyEditableFields(CourtRecurringBooking r, CourtRecurringBookingInputDTO in) {
        if (in.getCourtId() != null) r.setCourt(courtService.findByIdAndVerifyOwnership(in.getCourtId()));
        if (in.getCustomerId() != null) {
            r.setCustomer(customerService.findByIdAndVerifyOwnership(in.getCustomerId()));
        } else if (in.getCustomerPhone() != null && !in.getCustomerPhone().isBlank()) {
            r.setCustomer(customerService.findOrCreate(in.getCustomerName(), in.getCustomerPhone()));
        } else if (r.getCustomer() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El turno fijo necesita un cliente (customerId o customerName + customerPhone)");
        }
        if (in.getDayOfWeek() != null) r.setDayOfWeek(in.getDayOfWeek());
        if (in.getStartTime() != null) r.setStartTime(in.getStartTime());
        if (in.getEndTime() != null) {
            r.setEndTime(in.getEndTime());
        } else if (r.getEndTime() == null && in.getStartTime() != null) {
            // Default: un slot completo según la config del tenant.
            int slot = settingsService.getOrCreateForCurrentTenant().getSlotDurationMinutes();
            r.setEndTime(in.getStartTime().plusMinutes(slot));
        }
        if (in.getAgreedPrice() != null) r.setAgreedPrice(in.getAgreedPrice());
        if (in.getValidFrom() != null) r.setValidFrom(in.getValidFrom());
        if (in.getValidUntil() != null) r.setValidUntil(in.getValidUntil());
        if (in.getActive() != null) r.setActive(in.getActive());
        if (in.getNotes() != null) r.setNotes(in.getNotes());
    }
}
