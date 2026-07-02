package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Device;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

    /** Equipos vistos por última vez operando la sucursal dada, los más recientes primero. */
    List<Device> findByLastTenantIdOrderByLastSeenAtDesc(UUID tenantId);
}
