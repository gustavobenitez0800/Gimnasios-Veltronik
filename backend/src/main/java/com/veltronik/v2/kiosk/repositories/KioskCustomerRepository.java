package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskCustomer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Repository
public interface KioskCustomerRepository extends JpaRepository<KioskCustomer, UUID> {

    List<KioskCustomer> findByTenantIdOrderByFullNameAsc(UUID tenantId);
    List<KioskCustomer> findByTenantIdAndActiveTrueOrderByFullNameAsc(UUID tenantId);

    /** Clientes con deuda (para el resumen de fiado). */
    @Query("SELECT c FROM KioskCustomer c WHERE c.tenant.id = :tenantId AND c.balance <> 0 ORDER BY c.balance DESC")
    List<KioskCustomer> findWithDebt(@Param("tenantId") UUID tenantId);

    /**
     * Aplica un delta firmado al saldo (deuda) con un UPDATE atómico — mismo criterio anti
     * lost-update que el stock: la BD hace la aritmética, sin read-modify-write.
     */
    @Modifying
    @Query("UPDATE KioskCustomer c SET c.balance = c.balance + :delta, c.updatedAt = CURRENT_TIMESTAMP WHERE c.id = :id")
    void applyBalanceDelta(@Param("id") UUID id, @Param("delta") BigDecimal delta);
}
