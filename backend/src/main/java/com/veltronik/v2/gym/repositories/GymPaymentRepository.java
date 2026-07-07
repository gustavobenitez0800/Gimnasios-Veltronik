package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPayment;
import org.springframework.data.domain.Pageable;
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

    /** Últimos pagos del tenant (límite en BD por Pageable — para feeds/actividad, no cargar el historial entero). */
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId ORDER BY p.paymentDate DESC")
    List<GymPayment> findRecentByTenantId(@Param("tenantId") UUID tenantId, Pageable pageable);

    /**
     * Pagos del tenant en el rango [from, to] (ambos inclusivos). {@code from}/{@code to}
     * llegan SIEMPRE no-null desde el service (pone bordes centinela si el usuario no acota
     * un extremo). El query es un {@code >= AND <=} limpio a propósito: el patrón anterior
     * '({@code :param} IS NULL OR ...)' tiraba una JDBC exception en Hibernate 6 + PostgreSQL
     * (no podía inferir el tipo del bind-parameter dentro del IS NULL) → HTTP 400, que dejaba
     * Pagos y Reportes EN BLANCO con cualquier filtro de fecha.
     */
    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId "
            + "AND p.paymentDate >= :from AND p.paymentDate <= :to "
            + "ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantIdAndDateRange(@Param("tenantId") UUID tenantId,
                                                @Param("from") LocalDateTime from,
                                                @Param("to") LocalDateTime to);

    @Query("SELECT p FROM GymPayment p LEFT JOIN FETCH p.member WHERE p.tenant.id = :tenantId AND p.member.id = :memberId ORDER BY p.paymentDate DESC")
    List<GymPayment> findByTenantIdAndMemberId(@Param("tenantId") UUID tenantId, @Param("memberId") UUID memberId);
    
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM GymPayment p WHERE p.tenant.id = :tenantId AND p.paymentDate >= :startDate AND p.status = 'PAID'")
    BigDecimal sumAmountByTenantIdAndDateAfter(@Param("tenantId") UUID tenantId, @Param("startDate") LocalDateTime startDate);
}
