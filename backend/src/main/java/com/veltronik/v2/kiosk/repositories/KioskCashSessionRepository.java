package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskCashSession;
import com.veltronik.v2.kiosk.entities.KioskCashSessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface KioskCashSessionRepository extends JpaRepository<KioskCashSession, UUID> {

    /** La caja abierta del tenant (a lo sumo una, garantizado por el índice único parcial). */
    Optional<KioskCashSession> findByTenantIdAndStatus(UUID tenantId, KioskCashSessionStatus status);

    List<KioskCashSession> findTop30ByTenantIdOrderByOpenedAtDesc(UUID tenantId);
}
