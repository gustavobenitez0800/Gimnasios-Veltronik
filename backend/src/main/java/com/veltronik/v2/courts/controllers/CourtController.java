package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtDTO;
import com.veltronik.v2.courts.dto.CourtInputDTO;
import com.veltronik.v2.courts.entities.Court;
import com.veltronik.v2.courts.mappers.CourtsMapper;
import com.veltronik.v2.courts.services.CourtService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * API REST de canchas. Salida SIEMPRE por DTO; entrada por InputDTO con patch parcial
 * (cierra mass-assignment). Mismo patrón que GymClassController.
 */
@RestController
@RequestMapping("/api/courts")
public class CourtController {

    private final CourtService courtService;
    private final CourtsMapper mapper;

    public CourtController(CourtService courtService, CourtsMapper mapper) {
        this.courtService = courtService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<CourtDTO>> getAll() {
        return ResponseEntity.ok(mapper.toCourtDtoList(courtService.findAllForCurrentTenant()));
    }

    @GetMapping("/active")
    public ResponseEntity<List<CourtDTO>> getActive() {
        return ResponseEntity.ok(mapper.toCourtDtoList(courtService.findActiveForCurrentTenant()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourtDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(courtService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<CourtDTO> create(@Valid @RequestBody CourtInputDTO input) {
        Court court = new Court();
        applyEditableFields(court, input);
        return ResponseEntity.ok(mapper.toDto(courtService.saveForCurrentTenant(court)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CourtDTO> update(@PathVariable UUID id, @Valid @RequestBody CourtInputDTO input) {
        Court court = courtService.findByIdAndVerifyOwnership(id);
        applyEditableFields(court, input);
        return ResponseEntity.ok(mapper.toDto(courtService.saveForCurrentTenant(court)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        courtService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    private void applyEditableFields(Court c, CourtInputDTO in) {
        if (in.getName() != null) c.setName(in.getName());
        if (in.getSurface() != null) c.setSurface(in.getSurface());
        if (in.getCovered() != null) c.setCovered(in.getCovered());
        if (in.getActive() != null) c.setActive(in.getActive());
        if (in.getDisplayOrder() != null) c.setDisplayOrder(in.getDisplayOrder());
        if (in.getNotes() != null) c.setNotes(in.getNotes());
    }
}
