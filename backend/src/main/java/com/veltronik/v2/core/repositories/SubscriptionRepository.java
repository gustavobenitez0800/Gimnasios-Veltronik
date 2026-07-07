package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    // Buscar la suscripción más reciente de un tenant
    Optional<Subscription> findFirstByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    // Buscar la suscripción por ID de MP
    Optional<Subscription> findByMpSubscriptionId(String mpSubscriptionId);

    // Obtener la última suscripción de varios tenants
    List<Subscription> findByTenantIdIn(List<UUID> tenantIds);

    /**
     * Normaliza el estado de las suscripciones que MIENTEN: una {@code active} cuyo período
     * ya venció pasa a {@code expired}. NO cambia el acceso (un período vencido ya no habilita
     * según {@link com.veltronik.v2.core.security.SubscriptionAccessPolicy}); corrige el ESTADO
     * que de otro modo quedaría como {@code active} para siempre — el caso de las suscripciones
     * migradas de V1 que nunca se re-suscribieron en V2.
     *
     * <p>Bulk update: {@code @PreUpdate} NO dispara, por eso seteamos {@code updated_at} a mano.</p>
     *
     * <p>Respeta la GRACIA: una 'active' con período vencido pero {@code grace_period_ends_at}
     * futuro está esperando la renovación mensual de MP (la ventana que la policy honra como
     * IN_GRACE) — expirarla acá le cortaría el acceso antes de tiempo. Solo se normaliza
     * cuando la gracia también venció (o no existe, caso migrado de V1).</p>
     *
     * @return cantidad de filas normalizadas.
     */
    @Modifying
    @Query("""
            UPDATE Subscription s
               SET s.status = 'expired', s.updatedAt = :now
             WHERE s.status = 'active'
               AND s.currentPeriodEnd IS NOT NULL
               AND s.currentPeriodEnd < :now
               AND (s.gracePeriodEndsAt IS NULL OR s.gracePeriodEndsAt < :now)
            """)
    int markLapsedActiveAsExpired(@Param("now") LocalDateTime now);
}
