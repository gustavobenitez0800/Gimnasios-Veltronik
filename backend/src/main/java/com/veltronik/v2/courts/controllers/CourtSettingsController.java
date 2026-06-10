package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtSettingsDTO;
import com.veltronik.v2.courts.dto.CourtSettingsInputDTO;
import com.veltronik.v2.courts.mappers.CourtsMapper;
import com.veltronik.v2.courts.services.CourtSettingsService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** API REST de la configuración del vertical (slot, horarios, seña). */
@RestController
@RequestMapping("/api/courts/settings")
public class CourtSettingsController {

    private final CourtSettingsService settingsService;
    private final CourtsMapper mapper;

    public CourtSettingsController(CourtSettingsService settingsService, CourtsMapper mapper) {
        this.settingsService = settingsService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<CourtSettingsDTO> get() {
        return ResponseEntity.ok(mapper.toDto(settingsService.getOrCreateForCurrentTenant()));
    }

    @PutMapping
    public ResponseEntity<CourtSettingsDTO> update(@Valid @RequestBody CourtSettingsInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(settingsService.updateForCurrentTenant(input)));
    }
}
