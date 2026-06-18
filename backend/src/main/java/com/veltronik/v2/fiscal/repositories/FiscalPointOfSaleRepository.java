package com.veltronik.v2.fiscal.repositories;

import com.veltronik.v2.fiscal.entities.FiscalPointOfSale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FiscalPointOfSaleRepository extends JpaRepository<FiscalPointOfSale, UUID> {
    List<FiscalPointOfSale> findByTenantIdOrderByNumberAsc(UUID tenantId);
    Optional<FiscalPointOfSale> findByTenantIdAndNumber(UUID tenantId, Integer number);
}
