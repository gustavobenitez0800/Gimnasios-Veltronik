package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.AccessDenied;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccessDeniedRepository extends JpaRepository<AccessDenied, UUID> {

    /** La marca de los rechazos del molinete: la misma idea que la de los accesos. */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT count(*) || ':' || coalesce(to_char(max(greatest(
                       updated_at, occurred_at, coalesce(aviso_visto_at, occurred_at))), 'YYYYMMDDHH24MISSUS'), '-')
            FROM access_denied
            WHERE tenant_id = :tenantId AND occurred_at >= :desde
            """, nativeQuery = true)
    String marcaDesde(@org.springframework.data.repository.query.Param("tenantId") UUID tenantId,
                      @org.springframework.data.repository.query.Param("desde") java.time.LocalDateTime desde);

    /**
     * El último rechazo de este socio, para no guardar treinta veces el mismo.
     *
     * <p>El equipo avisa por <b>reconocimiento</b>, no por persona: mientras alguien está
     * parado frente a la cámara manda un aviso cada pocos segundos. En la prueba con el equipo
     * real fueron 6 avisos en 15 segundos.</p>
     */
    Optional<AccessDenied> findTopByTenantIdAndMemberIdOrderByOccurredAtDesc(UUID tenantId, UUID memberId);

    /** Los rechazos de hoy que el mostrador todavía no atendió. */
    List<AccessDenied> findByTenantIdAndAvisoVistoAtIsNullAndOccurredAtAfterOrderByOccurredAtDesc(
            UUID tenantId, LocalDateTime desde);
}
