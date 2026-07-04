package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.DeviceDTO;
import com.veltronik.v2.core.dto.DeviceEnrollRequest;
import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.exceptions.DeviceEnrollConflictException;
import com.veltronik.v2.core.security.DeviceContextHolder;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.DeviceRegistryService;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Equipos de la sucursal en curso (Fase 1 — docs/FASE1-PLAN.md).
 * Ladrillo 1: listado (semilla de Mission Control). Ladrillo 2: el bautizo
 * (enroll/revoke) y el estado del equipo que llama (/me).
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
        List<DeviceDTO> devices = deviceRegistryService.devicesOf(tenantId).stream()
                .map(d -> toDto(d, tenantId))
                .toList();
        return ResponseEntity.ok(Map.of("data", devices));
    }

    /**
     * Estado del equipo que llama, para que el instalable decida si mostrar el bautizo.
     * Abierto a cualquier usuario autenticado del tenant (un STAFF en una caja enrolada
     * también necesita saber el estado) — método pisa el @PreAuthorize de la clase.
     */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> myDevice() {
        UUID deviceId = DeviceContextHolder.getDeviceId();
        if (deviceId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Este dispositivo no envió su identificador (X-Device-Id)."));
        }
        UUID tenantId = TenantContextHolder.getTenantId();
        return deviceRegistryService.findDevice(deviceId)
                .<ResponseEntity<?>>map(d -> ResponseEntity.ok(Map.of("data", toDto(d, tenantId))))
                .orElseGet(() -> {
                    // Equipo aún no visto por el registro (el heartbeat lo crea enseguida).
                    Map<String, Object> body = new HashMap<>();
                    body.put("id", deviceId);
                    body.put("enrolled", false);
                    return ResponseEntity.ok(Map.of("data", body));
                });
    }

    /** El bautizo: enrola ESTE equipo (X-Device-Id) a la sucursal en curso. */
    @PostMapping("/enroll")
    public ResponseEntity<?> enroll(@Valid @RequestBody DeviceEnrollRequest request) {
        UUID deviceId = DeviceContextHolder.getDeviceId();
        if (deviceId == null) {
            return ResponseEntity.badRequest().body(Map.of("error",
                    "Este dispositivo no envió su identificador (X-Device-Id). Actualizá la app e intentá de nuevo."));
        }
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No hay negocio en la sesión."));
        }

        try {
            DeviceRegistryService.EnrollResult result = deviceRegistryService.enroll(
                    deviceId, tenantId, SecurityUtils.getCurrentUserId(),
                    request.getRole(), request.getDisplayName(), request.isReplaceActiveManager());
            // deviceKey: la credencial de equipo EN CLARO — viaja UNA sola vez (ladrillo 4).
            // El equipo la guarda para autenticar el sync headless; acá solo queda su hash.
            return ResponseEntity.ok(Map.of(
                    "data", toDto(result.device(), tenantId),
                    "deviceKey", result.deviceKey()));
        } catch (DeviceEnrollConflictException e) {
            // 409: ya hay una Caja Madre activa — la UI pregunta ¿reemplazo o error?
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "ENCARGADO_ACTIVO",
                    "message", e.getMessage(),
                    "conflictingDevice", toDto(e.getConflictingDevice(), tenantId)));
        }
    }

    /** Revoca el enrolamiento de un equipo de la sucursal. Nunca borra el historial. */
    @PostMapping("/{deviceId}/revoke")
    public ResponseEntity<?> revoke(@PathVariable UUID deviceId) {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No hay negocio en la sesión."));
        }
        deviceRegistryService.revoke(deviceId, tenantId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @Data
    public static class RingRequest {
        /** 0=piloto, 1=amigos, 2=todos. Null = todos (ladrillo 7, rollout escalonado). */
        private Short ring;
    }

    /** Asigna el anillo de update de un equipo (rollout escalonado, ADR-007). */
    @PostMapping("/{deviceId}/ring")
    public ResponseEntity<?> setRing(@PathVariable UUID deviceId, @RequestBody RingRequest request) {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No hay negocio en la sesión."));
        }
        deviceRegistryService.setRing(tenantId, deviceId, request.getRing());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private DeviceDTO toDto(Device d, UUID currentTenantId) {
        DeviceDTO dto = new DeviceDTO();
        dto.setId(d.getId());
        dto.setLastAppVersion(d.getLastAppVersion());
        dto.setLastSeenAt(d.getLastSeenAt());
        dto.setFirstSeenAt(d.getCreatedAt());
        dto.setEnrolled(d.isEnrolledActiveIn(currentTenantId));
        dto.setDisplayName(d.getDisplayName());
        dto.setRole(d.getRole() != null ? d.getRole().name() : null);
        dto.setStatus(d.getStatus() != null ? d.getStatus().name() : null);
        dto.setLastSyncAt(d.getLastSyncAt());
        dto.setUpdateRing(d.getUpdateRing());
        return dto;
    }
}
