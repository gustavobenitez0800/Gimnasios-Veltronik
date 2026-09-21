package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPaymentImport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GymPaymentImportRepository extends JpaRepository<GymPaymentImport, UUID> {

    Optional<GymPaymentImport> findFirstByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    Optional<GymPaymentImport> findFirstByTenantIdAndDeshechaAtIsNullOrderByCreatedAtDesc(UUID tenantId);
}
