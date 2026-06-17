package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtConversation;
import com.veltronik.v2.courts.entities.CourtConversationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CourtConversationRepository extends JpaRepository<CourtConversation, UUID> {

    /** La conversación del cliente (por teléfono de WhatsApp) dentro del tenant. */
    Optional<CourtConversation> findByTenantIdAndWaUserPhone(UUID tenantId, String waUserPhone);

    /** Métricas del bot para el dashboard. */
    long countByTenantId(UUID tenantId);
    long countByTenantIdAndStatus(UUID tenantId, CourtConversationStatus status);
}
