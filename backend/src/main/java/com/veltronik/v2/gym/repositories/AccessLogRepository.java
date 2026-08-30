package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * Accesos por QR de hoy que el mostrador todavía no atendió, del más nuevo al más viejo.
     *
     * <p><b>Solo los del QR, a propósito.</b> Los que carga la recepcionista a mano ya los vio
     * ella: la pantalla le muestra el estado del socio cuando lo elige de la lista. El aviso
     * existe justamente para los que entraron SIN que nadie los mirara.</p>
     */
    List<AccessLog> findByTenantIdAndAccessMethodAndAvisoVistoAtIsNullAndCheckInAtAfterOrderByCheckInAtDesc(
            UUID tenantId, String accessMethod, LocalDateTime desde);

    /**
     * A cuántos socios DISTINTOS marcó este teléfono desde {@code desde}.
     *
     * <p>Un socio marca siempre con el suyo, así que lo normal es 1. Un número mayor significa
     * que ese aparato se está usando para varias personas: puede ser una pareja que comparte
     * teléfono —perfectamente legítimo— o alguien probando documentos ajenos. El sistema no
     * juzga cuál es: lo marca para que lo mire una persona.</p>
     */
    @Query("""
            SELECT COUNT(DISTINCT a.member.id) FROM AccessLog a
             WHERE a.tenant.id = :tenantId
               AND a.scannerId = :scannerId
               AND a.checkInAt >= :desde
            """)
    long countSociosDistintosPorScanner(@Param("tenantId") UUID tenantId,
                                        @Param("scannerId") UUID scannerId,
                                        @Param("desde") LocalDateTime desde);
}
