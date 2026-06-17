package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CourtSettingsRepository extends JpaRepository<CourtSettings, UUID> {
    Optional<CourtSettings> findByTenantId(UUID tenantId);

    /** Enruta el webhook entrante de Meta → tenant. Corre sin contexto de tenant. */
    Optional<CourtSettings> findByWaPhoneNumberId(String waPhoneNumberId);
}
