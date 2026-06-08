package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymMember;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GymMemberRepository extends JpaRepository<GymMember, UUID> {
    List<GymMember> findByTenantId(UUID tenantId);
    long countByTenantId(UUID tenantId);

    /** Últimas altas de socios del tenant (para el feed de actividad del equipo). */
    List<GymMember> findTop25ByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    long countByTenantIdAndIsActiveTrue(UUID tenantId);

    // ── Paginación server-side ──
    Page<GymMember> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT m FROM GymMember m WHERE m.tenant.id = :tenantId AND (" +
           "LOWER(m.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(m.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(COALESCE(m.document, '')) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(COALESCE(m.email, '')) LIKE LOWER(CONCAT('%', :q, '%')))")
    Page<GymMember> searchByTenantId(@Param("tenantId") UUID tenantId, @Param("q") String q, Pageable pageable);

    // Para "Expiring Soon" (vencen en los próximos días)
    List<GymMember> findByTenantIdAndMembershipEndBetween(UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);

    // Para "At Risk" (vencidos en el pasado pero siguen marcados como activos)
    List<GymMember> findByTenantIdAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);
}
