package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymMemberImport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GymMemberImportRepository extends JpaRepository<GymMemberImport, UUID> {

    /** La última importación del gimnasio, deshecha o no. */
    Optional<GymMemberImport> findFirstByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    /** La última que sigue en pie: es la única que se puede deshacer. */
    Optional<GymMemberImport> findFirstByTenantIdAndDeshechaAtIsNullOrderByCreatedAtDesc(UUID tenantId);
}
