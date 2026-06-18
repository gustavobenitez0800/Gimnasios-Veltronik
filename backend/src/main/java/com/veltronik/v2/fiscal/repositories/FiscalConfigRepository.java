package com.veltronik.v2.fiscal.repositories;

import com.veltronik.v2.fiscal.entities.FiscalConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface FiscalConfigRepository extends JpaRepository<FiscalConfig, UUID> {
    Optional<FiscalConfig> findByTenantId(UUID tenantId);
}
