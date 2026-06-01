package com.veltronik.v2.core.services;

import com.veltronik.v2.core.dto.TenantGroupDTO;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantGroup;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.TenantGroupRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Gestión de grupos de sucursales del dueño. Transversal (core/).
 *
 * <p><b>Seguridad:</b> los grupos pertenecen al usuario dueño. Solo se opera sobre
 * grupos propios y solo se asignan sucursales donde el usuario es OWNER. Nunca se
 * confía en el dueño declarado por el cliente: se toma del contexto de seguridad.</p>
 */
@Service
@RequiredArgsConstructor
public class TenantGroupService {

    private final TenantGroupRepository groupRepository;
    private final TenantRepository tenantRepository;
    private final TenantMembershipRepository membershipRepository;

    /** Grupos del usuario actual (para el lobby). */
    @Transactional(readOnly = true)
    public List<TenantGroupDTO> findMyGroups() {
        UUID userId = requireUser();
        return groupRepository.findByOwnerUserIdOrderBySortOrderAscNameAsc(userId)
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public TenantGroupDTO create(TenantGroupDTO dto) {
        UUID userId = requireUser();
        TenantGroup g = new TenantGroup();
        g.setOwnerUserId(userId);
        g.setName(dto.getName());
        g.setColor(dto.getColor());
        g.setSortOrder(dto.getSortOrder());
        return toDto(groupRepository.save(g));
    }

    @Transactional
    public TenantGroupDTO update(UUID groupId, TenantGroupDTO dto) {
        TenantGroup g = requireOwnGroup(groupId);
        g.setName(dto.getName());
        g.setColor(dto.getColor());
        g.setSortOrder(dto.getSortOrder());
        return toDto(groupRepository.save(g));
    }

    /** Borra el grupo. Las sucursales NO se borran: quedan sin grupo (FK ON DELETE SET NULL). */
    @Transactional
    public void delete(UUID groupId) {
        TenantGroup g = requireOwnGroup(groupId);
        groupRepository.delete(g);
    }

    /**
     * Asigna (o quita, si groupId es null) una sucursal a un grupo. Requiere que el
     * usuario sea OWNER de la sucursal y dueño del grupo destino.
     */
    @Transactional
    public void assignTenantToGroup(UUID tenantId, UUID groupId) {
        UUID userId = requireUser();

        // El usuario debe ser OWNER de la sucursal que mueve.
        TenantMembership membership = membershipRepository.findByUserIdAndTenantId(userId, tenantId)
                .filter(TenantMembership::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "No tiene acceso a esta sucursal"));
        if (membership.getRole() != UserRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo el dueño puede agrupar sucursales");
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sucursal no encontrada"));

        if (groupId == null) {
            tenant.setGroup(null); // desagrupar
        } else {
            TenantGroup g = requireOwnGroup(groupId);
            tenant.setGroup(g);
        }
        tenantRepository.save(tenant);
    }

    // ─────────────── helpers ───────────────

    private UUID requireUser() {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No autenticado");
        return userId;
    }

    /** Devuelve el grupo solo si pertenece al usuario actual (evita tocar grupos ajenos). */
    private TenantGroup requireOwnGroup(UUID groupId) {
        UUID userId = requireUser();
        TenantGroup g = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Grupo no encontrado"));
        if (!g.getOwnerUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Este grupo no le pertenece");
        }
        return g;
    }

    private TenantGroupDTO toDto(TenantGroup g) {
        TenantGroupDTO dto = new TenantGroupDTO();
        dto.setId(g.getId());
        dto.setName(g.getName());
        dto.setColor(g.getColor());
        dto.setSortOrder(g.getSortOrder());
        return dto;
    }
}
