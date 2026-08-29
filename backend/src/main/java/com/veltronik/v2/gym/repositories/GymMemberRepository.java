package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymMember;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GymMemberRepository extends JpaRepository<GymMember, UUID> {
    List<GymMember> findByTenantId(UUID tenantId);
    long countByTenantId(UUID tenantId);

    /** Últimas altas de socios del tenant (para el feed de actividad del equipo). */
    List<GymMember> findTop25ByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    long countByTenantIdAndIsActiveTrue(UUID tenantId);

    // ── Paginación server-side ──
    Page<GymMember> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT m FROM GymMember m WHERE m.tenant.id = :tenantId AND (" +
           "LOWER(m.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(m.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(COALESCE(m.document, '')) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(COALESCE(m.email, '')) LIKE LOWER(CONCAT('%', :q, '%')))")
    Page<GymMember> searchByTenantId(@Param("tenantId") UUID tenantId, @Param("q") String q, Pageable pageable);

    /**
     * El socio con ese documento en ESTE gimnasio, comparando <b>normalizado</b>. Lo usa el
     * check-in por QR, donde el socio se identifica escribiendo su DNI.
     *
     * <p><b>Por qué normalizado y no exacto.</b> La primera versión comparaba el texto tal cual
     * y no encontraba a nadie: en la ficha puede estar {@code 30.111.222} y el socio escribe
     * {@code 30111222}, o al revés, o con un espacio de más al pegarlo. Son la misma persona y
     * el sistema decía "no te encontramos" con el número bien puesto. Un DNI es un número, no
     * una cadena: los puntos son adorno de impresión.</p>
     *
     * <p><b>Sigue siendo EXACTO, no "contiene".</b> Se limpian los separadores de los dos lados
     * y después se exige igualdad. El buscador del mostrador usa {@code LIKE} porque ahí hay una
     * persona eligiendo de una lista; acá no mira nadie, y un {@code LIKE} podría marcarle la
     * entrada al socio equivocado.</p>
     *
     * <p>Nativa porque {@code regexp_replace} es de Postgres. Lleva {@code tenant_id} explícito:
     * al ser nativa, el filtro de Hibernate no la toca y el aislamiento tiene que ir escrito a
     * mano — sin eso, un DNI podría encontrar al socio de otro gimnasio.</p>
     *
     * <p>Devuelve lista y no {@code Optional} porque el documento no tiene índice único: si un
     * gimnasio cargó dos veces a la misma persona, queremos enterarnos en vez de que explote.</p>
     *
     * @param documentoNormalizado el documento YA limpio (solo letras y números, en mayúsculas)
     */
    @Query(value = """
            SELECT * FROM gym_members m
             WHERE m.tenant_id = :tenantId
               AND m.document IS NOT NULL
               AND UPPER(regexp_replace(m.document, '[^0-9A-Za-z]', '', 'g')) = :documentoNormalizado
            """, nativeQuery = true)
    List<GymMember> findByDocumentoNormalizado(@Param("tenantId") UUID tenantId,
                                               @Param("documentoNormalizado") String documentoNormalizado);

    // Para "Expiring Soon" (vencen en los próximos días)
    List<GymMember> findByTenantIdAndMembershipEndBetween(UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);

    // Para "At Risk" (vencidos en el pasado pero siguen marcados como activos)
    List<GymMember> findByTenantIdAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);

    // Versiones COUNT (el dashboard solo necesita el número; cargar las entidades para .size() no escala)
    long countByTenantIdAndMembershipEndBetween(UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);
    long countByTenantIdAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);
}
