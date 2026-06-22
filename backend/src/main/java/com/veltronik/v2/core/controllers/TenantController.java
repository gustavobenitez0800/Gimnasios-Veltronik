package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.dto.WorkspaceDTO;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.WorkspacePolicy;
import com.veltronik.v2.core.services.TenantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Controlador REST para la entidad {@link com.veltronik.v2.core.entities.Tenant}.
 *
 * <p><b>IMPORTANTE — por qué NO hereda de {@link BaseController}:</b> Tenant es la
 * raíz del sistema y NO es una {@code TenantAwareEntity}, por lo que el filtro de
 * Hibernate no la protege. Exponer el CRUD genérico (findAll/getById/update/delete
 * abierto) permitiría a cualquier usuario autenticado <b>listar, editar o borrar
 * negocios ajenos</b>. Por eso cada endpoint valida explícitamente la pertenencia
 * (y el rol, cuando corresponde) contra {@code tenant_membership}.</p>
 *
 * <p>La creación de tenants NO vive acá: ocurre en
 * {@link SetupController} (POST /api/core/setup/tenant), que además crea la membresía
 * OWNER y resuelve el período de prueba.</p>
 */
@RestController
@RequestMapping("/api/tenants")
@RequiredArgsConstructor
public class TenantController {

    /** Roles autorizados a modificar los datos del negocio. */
    private static final Set<UserRole> CAN_EDIT = Set.of(UserRole.OWNER, UserRole.ADMIN);

    private final TenantService tenantService;
    private final TenantMembershipRepository membershipRepository;

    /** Lista los negocios a los que pertenece el usuario actual (para el Lobby). */
    @GetMapping("/my")
    public ResponseEntity<List<TenantDTO>> getMyTenants() {
        return ResponseEntity.ok(tenantService.findMyTenants());
    }

    /**
     * Rol del usuario en un negocio. Lo consume AuthContext.loadRoleForOrg al cambiar de
     * org. Faltaba en el backend → daba 500 (el front caía a un fallback, pero ensuciaba
     * la consola y podía dar un rol incorrecto). Requiere ser miembro del negocio.
     * Respuesta: {"role": "owner|admin|staff|reception"} en minúscula (lo que espera el front).
     */
    @GetMapping("/{id}/members/{userId}/role")
    public ResponseEntity<java.util.Map<String, String>> getMemberRole(@PathVariable UUID id,
                                                                       @PathVariable UUID userId) {
        requireMembership(id); // el solicitante debe pertenecer al negocio
        return membershipRepository.findByUserIdAndTenantId(userId, id)
                .map(m -> ResponseEntity.ok(java.util.Map.of("role", m.getRole().name().toLowerCase())))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El usuario no es miembro de este negocio"));
    }

    /** Devuelve un negocio. Requiere ser miembro activo de ese negocio. */
    @GetMapping("/{id}")
    public ResponseEntity<TenantDTO> getById(@PathVariable UUID id) {
        requireMembership(id);
        return ResponseEntity.ok(tenantService.findById(id));
    }

    /**
     * Manifiesto del espacio de trabajo: vertical + rol + módulos que el usuario puede VER.
     * Lo consume el front para dibujar la navegación sin duplicar la política de roles (antes
     * el Sidebar la espejaba a mano). La autorización REAL de los datos sigue por endpoint.
     * Requiere ser miembro activo del negocio.
     */
    @GetMapping("/{id}/workspace")
    public ResponseEntity<WorkspaceDTO> getWorkspace(@PathVariable UUID id) {
        TenantMembership membership = requireMembership(id);
        TenantDTO tenant = tenantService.findById(id);
        String orgType = tenant.getBusinessType() != null
                ? tenant.getBusinessType().name()
                : (tenant.getType() != null ? tenant.getType() : "GYM");
        return ResponseEntity.ok(new WorkspaceDTO(
                id,
                orgType,
                membership.getRole().name().toLowerCase(),
                WorkspacePolicy.modulesFor(membership.getRole())
        ));
    }

    /** Actualiza los datos del negocio. Requiere rol OWNER o ADMIN. */
    @PutMapping("/{id}")
    public ResponseEntity<TenantDTO> update(@PathVariable UUID id, @Valid @RequestBody TenantDTO dto) {
        requireRole(id, CAN_EDIT);
        return ResponseEntity.ok(tenantService.update(id, dto));
    }

    /** Elimina el negocio. Solo el OWNER puede hacerlo. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        requireRole(id, Set.of(UserRole.OWNER));
        tenantService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ─────────────────────────── Guards de autorización ───────────────────────────

    /** Exige que el usuario actual sea miembro ACTIVO del tenant; devuelve la membresía. */
    private TenantMembership requireMembership(UUID tenantId) {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No autenticado");
        }
        return membershipRepository.findByUserIdAndTenantId(userId, tenantId)
                .filter(TenantMembership::isActive)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "No tiene acceso a este negocio"));
    }

    /** Exige que el rol del usuario en el tenant esté dentro del conjunto permitido. */
    private void requireRole(UUID tenantId, Set<UserRole> allowed) {
        TenantMembership membership = requireMembership(tenantId);
        if (!allowed.contains(membership.getRole())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Su rol no permite esta operación");
        }
    }
}
