package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CajaCierreAjuste;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CajaCierreAjusteRepository extends JpaRepository<CajaCierreAjuste, UUID> {

    /** Las correcciones que entraron en un cierre: el detalle de su renglón "Correcciones". */
    List<CajaCierreAjuste> findByTenantIdAndCierreIdOrderByCreatedAtAsc(UUID tenantId, UUID cierreId);
}
