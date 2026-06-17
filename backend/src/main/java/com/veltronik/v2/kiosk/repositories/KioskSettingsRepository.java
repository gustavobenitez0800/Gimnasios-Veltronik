package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface KioskSettingsRepository extends JpaRepository<KioskSettings, UUID> {
    Optional<KioskSettings> findByTenantId(UUID tenantId);
}
