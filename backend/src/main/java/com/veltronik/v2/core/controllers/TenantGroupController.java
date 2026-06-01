package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.TenantGroupDTO;
import com.veltronik.v2.core.services.TenantGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Gestión de grupos de sucursales (para organizar el Lobby del dueño).
 *
 * <p>Bajo {@code /api/tenants/groups}: queda dentro del prefijo que el KillSwitch
 * exceptúa, de modo que un dueño con una sucursal vencida igual puede reordenar su
 * lobby (es navegación, no operación del negocio). La autorización real (dueño,
 * propiedad del grupo) la garantiza {@link TenantGroupService}.</p>
 */
@RestController
@RequestMapping("/api/tenants/groups")
@RequiredArgsConstructor
public class TenantGroupController {

    private final TenantGroupService groupService;

    /** Grupos del usuario actual. */
    @GetMapping
    public ResponseEntity<List<TenantGroupDTO>> getMyGroups() {
        return ResponseEntity.ok(groupService.findMyGroups());
    }

    @PostMapping
    public ResponseEntity<TenantGroupDTO> create(@Valid @RequestBody TenantGroupDTO dto) {
        return ResponseEntity.ok(groupService.create(dto));
    }

    @PutMapping("/{groupId}")
    public ResponseEntity<TenantGroupDTO> update(@PathVariable UUID groupId, @Valid @RequestBody TenantGroupDTO dto) {
        return ResponseEntity.ok(groupService.update(groupId, dto));
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Void> delete(@PathVariable UUID groupId) {
        groupService.delete(groupId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Asigna una sucursal a un grupo (o la desagrupa con groupId=null).
     * Body: {"groupId": "<uuid>"} o {"groupId": null}.
     */
    @PutMapping("/assign/{tenantId}")
    public ResponseEntity<Void> assign(@PathVariable UUID tenantId, @RequestBody Map<String, String> body) {
        String raw = body.get("groupId");
        UUID groupId = (raw == null || raw.isBlank()) ? null : UUID.fromString(raw);
        groupService.assignTenantToGroup(tenantId, groupId);
        return ResponseEntity.noContent().build();
    }
}
