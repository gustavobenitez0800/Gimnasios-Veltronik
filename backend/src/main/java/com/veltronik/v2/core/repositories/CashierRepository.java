package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Cashier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CashierRepository extends JpaRepository<Cashier, UUID> {

    List<Cashier> findByTenantIdOrderByNameAsc(UUID tenantId);

    /** Para la unicidad de PIN (se verifica contra los hashes) y el login por PIN. */
    List<Cashier> findByTenantIdAndActiveTrue(UUID tenantId);
}
