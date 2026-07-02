package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.DeviceDTO;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.DeviceRegistryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Equipos de la sucursal en curso (Fase 1, ladrillo 1 — semilla de Mission Control).
 * El enrolamiento (nombre, rol, estado) llega en el ladrillo 2.
 */
@RestController
@RequestMapping("/api/core/devices")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER','ADMIN')") // gestión de equipos: dueño/admin, no STAFF
public class DeviceController {

    private final DeviceRegistryService deviceRegistryService;

    @GetMapping
    public ResponseEntity<?> listDevices() {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No hay negocio en la sesión."));
        }
        List<DeviceDTO> devices = deviceRegistryService.devicesOf(tenantId).stream().map(d -> {
            DeviceDTO dto = new DeviceDTO();
            dto.setId(d.getId());
            dto.setLastAppVersion(d.getLastAppVersion());
            dto.setLastSeenAt(d.getLastSeenAt());
            dto.setFirstSeenAt(d.getCreatedAt());
            return dto;
        }).toList();
        return ResponseEntity.ok(Map.of("data", devices));
    }
}
