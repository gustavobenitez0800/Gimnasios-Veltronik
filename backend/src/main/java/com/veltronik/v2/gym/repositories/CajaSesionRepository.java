package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CajaSesion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CajaSesionRepository extends JpaRepository<CajaSesion, UUID> {

    /**
     * La caja abierta de este gimnasio, si hay alguna.
     *
     * <p>Devuelve {@code Optional} y no una lista porque un índice único parcial garantiza que
     * no puede haber dos. Si alguna vez hubiera dos, es un bug de la base y queremos que
     * explote acá y no que el mostrador elija una en silencio.</p>
     */
    Optional<CajaSesion> findByTenantIdAndCerradaAtIsNull(UUID tenantId);
}
