package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.security.SecurityUtils;
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

    /** Devuelve un negocio. Requiere ser miembro activo de ese negocio. */
    @GetMapping("/{id}")
    public ResponseEntity<TenantDTO> getById(@PathVariable UUID id) {
        requireMembership(id);
        return ResponseEntity.ok(tenantService.findById(id));
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
