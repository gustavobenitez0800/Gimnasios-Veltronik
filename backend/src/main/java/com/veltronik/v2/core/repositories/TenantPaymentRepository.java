package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.TenantPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantPaymentRepository extends JpaRepository<TenantPayment, UUID> {
    boolean existsByMpPaymentId(String mpPaymentId);
    Optional<TenantPayment> findByMpPaymentId(String mpPaymentId);
    Optional<TenantPayment> findByMpPreapprovalId(String mpPreapprovalId);
    List<TenantPayment> findByTenantIdOrderByPaymentDateDesc(UUID tenantId);
    Optional<TenantPayment> findFirstByTenantIdAndStatusOrderByPaymentDateDesc(UUID tenantId, String status);
}
