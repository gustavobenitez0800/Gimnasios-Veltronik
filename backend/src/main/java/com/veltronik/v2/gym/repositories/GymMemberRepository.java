package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GymMemberRepository extends JpaRepository<GymMember, UUID> {
    List<GymMember> findByTenantId(UUID tenantId);
    long countByTenantId(UUID tenantId);
    long countByTenantIdAndIsActiveTrue(UUID tenantId);

    // Para "Expiring Soon" (vencen en los próximos días)
    List<GymMember> findByTenantIdAndMembershipEndBetween(UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);

    // Para "At Risk" (vencidos en el pasado pero siguen marcados como activos)
    List<GymMember> findByTenantIdAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);
}
