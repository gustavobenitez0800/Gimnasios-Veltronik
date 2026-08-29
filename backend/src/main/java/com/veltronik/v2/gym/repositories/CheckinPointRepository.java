package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.CheckinPoint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CheckinPointRepository extends JpaRepository<CheckinPoint, UUID> {

    List<CheckinPoint> findByTenantIdAndActiveTrueOrderByCreatedAtDesc(UUID tenantId);

    /**
     * Resuelve el token del QR a su gimnasio. <b>Consulta NATIVA a propósito.</b>
     *
     * <p>Todas las demás consultas de la app corren con el filtro de Hibernate que agrega
     * {@code WHERE tenant_id = ?} usando el gimnasio de la sesión. Acá no hay sesión: el que
     * escanea es un socio con su teléfono, sin login. Y no hay gimnasio "actual" porque
     * <b>averiguar cuál es</b> es justamente lo que hace esta consulta — es el huevo y la
     * gallina. En JPQL el filtro se activaría con un tenant nulo y no encontraría nada nunca.</p>
     *
     * <p>Es la única puerta sin filtro de todo el módulo, y por eso devuelve el {@code tenant_id}:
     * el servicio lo usa para <b>plantar</b> el contexto y que de ahí en adelante todo vuelva a
     * correr aislado y normal.</p>
     *
     * <p>Solo trae puntos activos: rotar el QR es apagar el viejo, y un cartel viejo fotografiado
     * tiene que dejar de funcionar.</p>
     */
    @Query(value = """
            SELECT cp.id          AS "pointId",
                   cp.tenant_id   AS "tenantId",
                   cp.name        AS "pointName",
                   t.name         AS "gymName"
              FROM checkin_point cp
              JOIN tenant t ON t.id = cp.tenant_id
             WHERE cp.token = :token
               AND cp.active = true
               AND t.is_active = true
            """, nativeQuery = true)
    Optional<PointLookup> findByToken(@Param("token") String token);

    /** Proyección del lookup público: lo mínimo para resolver el escaneo. */
    interface PointLookup {
        UUID getPointId();
        UUID getTenantId();
        String getPointName();
        String getGymName();
    }
}
