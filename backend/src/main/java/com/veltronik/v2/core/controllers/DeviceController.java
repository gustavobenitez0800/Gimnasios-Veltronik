package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.DeviceDTO;
import com.veltronik.v2.core.dto.DeviceEnrollRequest;
import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.DeviceStatus;
import com.veltronik.v2.core.exceptions.DeviceEnrollConflictException;
import com.veltronik.v2.core.repositories.TenantRepository;
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
    /** Para poner el NOMBRE de la sucursal de enrolamiento en /me (Fase 3). */
    private final TenantRepository tenantRepository;

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
     * Estado del equipo que llama.
     *
     * <p>Es la PRIMERA pregunta que hace la app de escritorio al arrancar (Fase 3):
     * "¿a qué sucursal pertenezco?". Si está enrolada, entra directo a esa sucursal y no
     * muestra ningún selector; si no, ofrece activarse. Por eso funciona SIN un tenant en
     * la sesión —el KillSwitch la exceptúa explícitamente— y por eso devuelve
     * {@code enrolledTenantId} además del {@code enrolled} relativo al tenant en curso.</p>
     *
     * <p>Abierto a cualquier usuario autenticado (un STAFF en un terminal enrolado también
     * necesita saber el estado) — el método pisa el {@code @PreAuthorize} de la clase.</p>
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

        // Atadura absoluta (Fase 3): solo si el enrolamiento está VIGENTE. Un equipo
        // revocado tiene enrolled_tenant_id cargado pero ya no pertenece a nadie —
        // informarlo como atado dejaría a la app entrando a una sucursal que le sacaron.
        if (d.getEnrolledTenantId() != null && d.getStatus() == DeviceStatus.ACTIVE) {
            dto.setEnrolledTenantId(d.getEnrolledTenantId());
            tenantRepository.findById(d.getEnrolledTenantId())
                    .ifPresent(t -> dto.setEnrolledTenantName(t.getName()));
        }

        dto.setDisplayName(d.getDisplayName());
        dto.setRole(d.getRole() != null ? d.getRole().name() : null);
        dto.setStatus(d.getStatus() != null ? d.getStatus().name() : null);
        dto.setLastSyncAt(d.getLastSyncAt());
        dto.setUpdateRing(d.getUpdateRing());
        return dto;
    }
}
