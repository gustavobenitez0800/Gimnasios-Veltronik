package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.Court;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CourtRepository extends JpaRepository<Court, UUID> {
    List<Court> findByTenantIdOrderByDisplayOrderAscNameAsc(UUID tenantId);
    List<Court> findByTenantIdAndActiveTrueOrderByDisplayOrderAscNameAsc(UUID tenantId);
}
