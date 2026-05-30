package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface GymPaymentRepository extends JpaRepository<GymPayment, UUID> {
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantId(@Param("tenantId") UUID tenantId);
    
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM GymPayment p WHERE p.tenant.id = :tenantId AND p.paymentDate >= :startDate AND p.status = 'PAID'")
    BigDecimal sumAmountByTenantIdAndDateAfter(@Param("tenantId") UUID tenantId, @Param("startDate") LocalDateTime startDate);
}
