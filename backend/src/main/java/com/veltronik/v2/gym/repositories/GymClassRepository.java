package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymClass;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GymClassRepository extends JpaRepository<GymClass, UUID> {
    List<GymClass> findByTenantId(UUID tenantId);
    List<GymClass> findByTenantIdAndIsActiveTrue(UUID tenantId);
}
