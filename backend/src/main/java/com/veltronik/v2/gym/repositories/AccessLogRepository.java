package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccessLogRepository extends JpaRepository<AccessLog, UUID> {
    
    List<AccessLog> findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(UUID tenantId, LocalDateTime start, LocalDateTime end);

    /** Últimos accesos del tenant (para el feed de actividad del equipo). */
    List<AccessLog> findTop25ByTenantIdOrderByCheckInAtDesc(UUID tenantId);
    
    List<AccessLog> findByTenantIdAndCheckOutAtIsNullOrderByCheckInAtDesc(UUID tenantId);
    
    Optional<AccessLog> findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(UUID tenantId, UUID memberId);

    /**
     * Visitas que quedaron abiertas con la entrada anterior a {@code limite} — las que el socio
     * nunca cerró. Las busca el cierre nocturno.
     *
     * <p>Sin tenant a propósito: el trabajo nocturno corre para todo el sistema, fuera de una
     * sesión, y no tiene un gimnasio "actual" del que colgarse.</p>
     */
    List<AccessLog> findByCheckOutAtIsNullAndCheckInAtBefore(LocalDateTime limite);
}
