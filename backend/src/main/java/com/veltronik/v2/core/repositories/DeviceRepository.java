package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.DeviceRole;
import com.veltronik.v2.core.entities.DeviceStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

    /** Equipos vistos por última vez operando la sucursal dada, los más recientes primero. */
    List<Device> findByLastTenantIdOrderByLastSeenAtDesc(UUID tenantId);

    /** Equipos de la sucursal: enrolados a ella O vistos operándola (para el listado del dueño). */
    List<Device> findByEnrolledTenantIdOrLastTenantIdOrderByLastSeenAtDesc(UUID enrolledTenantId, UUID lastTenantId);

    /** Para la integridad "un encargado activo por sucursal". */
    List<Device> findByEnrolledTenantIdAndRoleAndStatus(UUID tenantId, DeviceRole role, DeviceStatus status);
}
