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

    /**
     * Pagos del tenant filtrados por rango de fecha [from, to]. Ambos límites son
     * opcionales: si {@code from}/{@code to} es null, ese extremo no acota (permite
     * "solo desde", "solo hasta" o todos). El rango es inclusivo; el caller construye
     * {@code to} como fin del día (23:59:59) en hora AR para no recortar el último día.
     */
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId "
            + "AND (:from IS NULL OR p.paymentDate >= :from) "
            + "AND (:to IS NULL OR p.paymentDate <= :to) "
            + "ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantIdAndDateRange(@Param("tenantId") UUID tenantId,
                                                @Param("from") LocalDateTime from,
                                                @Param("to") LocalDateTime to);

    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId AND p.member.id = :memberId ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantIdAndMemberId(@Param("tenantId") UUID tenantId, @Param("memberId") UUID memberId);
    
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM GymPayment p WHERE p.tenant.id = :tenantId AND p.paymentDate >= :startDate AND p.status = 'PAID'")
    BigDecimal sumAmountByTenantIdAndDateAfter(@Param("tenantId") UUID tenantId, @Param("startDate") LocalDateTime startDate);
}
