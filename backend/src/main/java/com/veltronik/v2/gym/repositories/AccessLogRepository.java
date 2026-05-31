package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccessLogRepository extends JpaRepository<AccessLog, UUID> {
    
    List<AccessLog> findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(UUID tenantId, LocalDateTime start, LocalDateTime end);
    
    List<AccessLog> findByTenantIdAndCheckOutAtIsNullOrderByCheckInAtDesc(UUID tenantId);
    
    Optional<AccessLog> findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(UUID tenantId, UUID memberId);
    
    @Query("SELECT COUNT(a) FROM AccessLog a WHERE a.tenant.id = :tenantId AND a.checkInAt >= :startOfDay AND a.checkInAt <= :endOfDay")
    long countTodayAccesses(@Param("tenantId") UUID tenantId, @Param("startOfDay") LocalDateTime startOfDay, @Param("endOfDay") LocalDateTime endOfDay);
}
