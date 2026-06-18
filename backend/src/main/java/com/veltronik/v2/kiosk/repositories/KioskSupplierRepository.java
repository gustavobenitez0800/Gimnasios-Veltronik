package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskSupplier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KioskSupplierRepository extends JpaRepository<KioskSupplier, UUID> {
    List<KioskSupplier> findByTenantIdOrderByNameAsc(UUID tenantId);
    List<KioskSupplier> findByTenantIdAndActiveTrueOrderByNameAsc(UUID tenantId);
}
