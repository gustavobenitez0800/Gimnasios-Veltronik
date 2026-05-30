package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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
}
