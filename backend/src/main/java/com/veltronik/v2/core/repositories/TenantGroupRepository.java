package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.TenantGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TenantGroupRepository extends JpaRepository<TenantGroup, UUID> {

    /** Grupos de un dueño, ordenados para el lobby. */
    List<TenantGroup> findByOwnerUserIdOrderBySortOrderAscNameAsc(UUID ownerUserId);
}
