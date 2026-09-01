package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CajaCierre;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CajaCierreRepository extends JpaRepository<CajaCierre, UUID> {

    /**
     * El último cierre. Es de donde arranca el próximo período.
     *
     * <p>Se ordena por {@code hasta} y no por {@code createdAt}: son casi siempre lo mismo,
     * pero el período lo define hasta cuándo cubre el cierre, no cuándo se guardó la fila.</p>
     */
    Optional<CajaCierre> findTopByTenantIdOrderByHastaDesc(UUID tenantId);

    /** El historial que mira el dueño, del más reciente al más viejo. */
    List<CajaCierre> findByTenantIdOrderByHastaDesc(UUID tenantId, Pageable pageable);
}
