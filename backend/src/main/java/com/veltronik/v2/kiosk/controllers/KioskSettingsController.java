package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskSettingsDTO;
import com.veltronik.v2.kiosk.dto.KioskSettingsInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskSettingsService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** Configuración del vertical Kiosco (una por tenant). Solo gestión (dueño/admin). */
@RestController
@RequestMapping("/api/kiosk/settings")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class KioskSettingsController {

    private final KioskSettingsService settingsService;
    private final KioskMapper mapper;

    public KioskSettingsController(KioskSettingsService settingsService, KioskMapper mapper) {
        this.settingsService = settingsService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<KioskSettingsDTO> get() {
        return ResponseEntity.ok(mapper.toDto(settingsService.getOrCreateForCurrentTenant()));
    }

    @PutMapping
    public ResponseEntity<KioskSettingsDTO> update(@Valid @RequestBody KioskSettingsInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(settingsService.updateForCurrentTenant(input)));
    }
}
