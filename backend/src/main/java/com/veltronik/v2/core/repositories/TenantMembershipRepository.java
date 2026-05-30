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
}
