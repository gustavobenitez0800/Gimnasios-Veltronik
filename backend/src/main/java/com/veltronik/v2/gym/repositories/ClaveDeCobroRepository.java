package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.ClaveDeCobro;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** La clave para cobrar, una por sucursal. */
public interface ClaveDeCobroRepository extends JpaRepository<ClaveDeCobro, UUID> {

    Optional<ClaveDeCobro> findByTenantId(UUID tenantId);

    boolean existsByTenantId(UUID tenantId);
}
