package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.TenantMembership;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantMembershipRepository extends JpaRepository<TenantMembership, UUID> {
    
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"tenant"})
    List<TenantMembership> findByUserId(UUID userId);
    
    Optional<TenantMembership> findByUserIdAndTenantId(UUID userId, UUID tenantId);
    List<TenantMembership> findByTenantIdAndActiveTrue(UUID tenantId);
    List<TenantMembership> findByTenantId(UUID tenantId);

    /**
     * Verifica de forma eficiente (sin hidratar la entidad) que el usuario
     * tenga una membresía ACTIVA en el tenant. Usado por TenantContextFilter
     * para autorizar el header X-Tenant-ID en cada request.
     */
    boolean existsByUserIdAndTenantIdAndActiveTrue(UUID userId, UUID tenantId);
}
