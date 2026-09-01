package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPaymentAjuste;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface GymPaymentAjusteRepository extends JpaRepository<GymPaymentAjuste, UUID> {

    /** Lo que se tocó en un período. Es lo que el cierre de caja tiene que mostrar. */
    List<GymPaymentAjuste> findByTenantIdAndCreatedAtBetweenOrderByCreatedAtDesc(
            UUID tenantId, LocalDateTime desde, LocalDateTime hasta);
}
