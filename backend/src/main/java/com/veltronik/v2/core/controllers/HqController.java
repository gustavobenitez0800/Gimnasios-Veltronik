package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.FleetDeviceDTO;
import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.UpdateRollout;
import com.veltronik.v2.core.repositories.DeviceRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.FounderPolicy;
import com.veltronik.v2.core.services.RolloutService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Mission Control (ladrillo 7): la consola del FUNDADOR sobre toda la flota, por encima
 * de los negocios. No es de un dueño — es cross-tenant. Gateada por {@link FounderPolicy}
 * (email de fundador), no por rol de tenant.
 *
 * <p>{@code /api/hq/**} queda fuera del KillSwitch y del filtro de tenant (es global):
 * el fundador la abre sin una sucursal seleccionada.</p>
 */
@RestController
@RequestMapping("/api/hq")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()") // logueado con Google; el chequeo de FUNDADOR es aparte
public class HqController {

    private final DeviceRepository deviceRepository;
    private final TenantRepository tenantRepository;
    private final RolloutService rolloutService;
    private final FounderPolicy founderPolicy;

    @Data
    public static class RolloutRequest {
        @NotNull(message = "Indicá el anillo (0=piloto, 1=amigos, 2=todos)")
        private Short ring;
        @NotBlank(message = "Indicá la versión objetivo")
        private String targetVersion;
    }

    /** ¿El usuario actual es fundador? (para que el frontend muestre o no Mission Control). */
    @GetMapping("/access")
    public ResponseEntity<?> access() {
        return ResponseEntity.ok(Map.of("founder", founderPolicy.isFounder()));
    }

    /** La flota completa (todos los negocios), para el tablero. */
    @GetMapping("/fleet")
    public ResponseEntity<?> fleet() {
        if (notFounder()) return forbidden();

        List<Device> devices = deviceRepository.findAll();
        // Resolver nombres de negocio en un solo golpe (evita N+1).
        List<UUID> tenantIds = devices.stream()
                .map(d -> d.getEnrolledTenantId() != null ? d.getEnrolledTenantId() : d.getLastTenantId())
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, String> tenantNames = tenantRepository.findAllById(tenantIds).stream()
                .collect(Collectors.toMap(Tenant::getId, Tenant::getName));

        List<FleetDeviceDTO> fleet = devices.stream().map(d -> {
            FleetDeviceDTO dto = new FleetDeviceDTO();
            dto.setId(d.getId());
            UUID tid = d.getEnrolledTenantId() != null ? d.getEnrolledTenantId() : d.getLastTenantId();
            dto.setTenantName(tid != null ? tenantNames.getOrDefault(tid, "—") : "—");
            dto.setDisplayName(d.getDisplayName());
            dto.setRole(d.getRole() != null ? d.getRole().name() : null);
            dto.setStatus(d.getStatus() != null ? d.getStatus().name() : null);
            dto.setUpdateRing(d.getUpdateRing());
            dto.setLastAppVersion(d.getLastAppVersion());
            dto.setLastSeenAt(d.getLastSeenAt());
            dto.setLastSyncAt(d.getLastSyncAt());
            return dto;
        }).toList();
        return ResponseEntity.ok(Map.of("data", fleet));
    }

    /** Versiones objetivo publicadas por anillo. */
    @GetMapping("/rollout")
    public ResponseEntity<?> rollout() {
        if (notFounder()) return forbidden();
        Map<String, String> targets = rolloutService.all().stream()
                .collect(Collectors.toMap(r -> String.valueOf(r.getRing()), UpdateRollout::getTargetVersion));
        return ResponseEntity.ok(Map.of("data", targets));
    }

    /** Publica la versión objetivo de un anillo (promover Piloto → Amigos → Todos). */
    @PostMapping("/rollout")
    public ResponseEntity<?> setRollout(@Valid @RequestBody RolloutRequest request) {
        if (notFounder()) return forbidden();
        UpdateRollout saved = rolloutService.setTarget(request.getRing(), request.getTargetVersion());
        return ResponseEntity.ok(Map.of("ring", saved.getRing(), "targetVersion", saved.getTargetVersion()));
    }

    private boolean notFounder() {
        return !founderPolicy.isFounder();
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "NOT_FOUNDER", "message", "Solo el fundador puede ver Mission Control."));
    }
}
