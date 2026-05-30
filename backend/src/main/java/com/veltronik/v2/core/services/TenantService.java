package com.veltronik.v2.core.services;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.mappers.TenantMapper;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Servicio concreto para la entidad {@link Tenant}.
 *
 * Esta es la primera implementación real del patrón genérico CRUD.
 * Equivale al {@code PaisAplicativoFacade} del SIG JEE7: hereda toda
 * la lógica CRUD de {@link BaseServiceImpl} y solo necesita implementar
 * los 4 métodos abstractos de "cableado" (repository, mapper, nombre).
 *
 * <p><b>¿Para qué sirve esto?</b> Cuando un Junior necesite crear el
 * servicio de "Socios" para el módulo Gym, solo tiene que copiar esta
 * estructura reemplazando Tenant por GymMember y TenantDTO por GymMemberDTO.</p>
 *
 * @see BaseServiceImpl
 * @see TenantMapper
 */
@Service
@RequiredArgsConstructor
public class TenantService extends BaseServiceImpl<Tenant, TenantDTO, UUID> {

    private final TenantRepository tenantRepository;
    private final TenantMapper tenantMapper;
    private final com.veltronik.v2.core.repositories.TenantMembershipRepository membershipRepository;

    @Override
    protected String getEntityName() {
        return "Tenant";
    }

    @Override
    protected JpaRepository<Tenant, UUID> getRepository() {
        return tenantRepository;
    }

    @Override
    protected TenantDTO toDto(Tenant entity) {
        return tenantMapper.toDto(entity);
    }

    @Override
    protected Tenant toEntity(TenantDTO dto) {
        return tenantMapper.toEntity(dto);
    }

    @Override
    protected void updateEntity(TenantDTO dto, Tenant entity) {
        tenantMapper.updateEntityFromDto(dto, entity);
    }
    
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<TenantDTO> findMyTenants() {
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return java.util.Collections.emptyList();
        
        Object principal = auth.getPrincipal();
        if (!(principal instanceof com.veltronik.v2.core.entities.AppUser)) return java.util.Collections.emptyList();
        
        com.veltronik.v2.core.entities.AppUser user = (com.veltronik.v2.core.entities.AppUser) principal;
        
        java.util.List<com.veltronik.v2.core.entities.TenantMembership> memberships = membershipRepository.findByUserId(user.getId());
        
        return memberships.stream().map(m -> {
            TenantDTO dto = tenantMapper.toDto(m.getTenant());
            dto.setRole(m.getRole().name().toLowerCase());
            dto.setType(m.getTenant().getBusinessType().name());
            return dto;
        }).collect(java.util.stream.Collectors.toList());
    }
}
