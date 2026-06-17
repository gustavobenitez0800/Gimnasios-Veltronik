package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KioskCategoryRepository extends JpaRepository<KioskCategory, UUID> {
    List<KioskCategory> findByTenantIdOrderByDisplayOrderAscNameAsc(UUID tenantId);
    List<KioskCategory> findByTenantIdAndActiveTrueOrderByDisplayOrderAscNameAsc(UUID tenantId);
}
