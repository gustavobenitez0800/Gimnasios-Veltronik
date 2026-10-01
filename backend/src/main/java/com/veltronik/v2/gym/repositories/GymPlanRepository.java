package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GymPlanRepository extends JpaRepository<GymPlan, UUID> {

    /** Los que se venden hoy, para el selector de cobro. Ordenados por precio: así aparecen
     *  como suelen estar en el cartel de la pared. */
    List<GymPlan> findByTenantIdAndIsActiveTrueOrderByPriceAsc(UUID tenantId);

    /** Todos, incluidos los dados de baja: la pantalla de configuración los muestra para
     *  poder reactivarlos, y los pagos viejos los siguen nombrando. */
    List<GymPlan> findByTenantIdOrderByIsActiveDescPriceAsc(UUID tenantId);

    /**
     * La MARCA de los aranceles del gimnasio: cambia con cada alta, edición o baja. Una fila.
     *
     * <p>La lista de socios lleva el nombre del arancel de cada uno, así que renombrar
     * "Mensual" tiene que invalidar la foto de la lista aunque ningún socio haya cambiado.
     * La suma y no el máximo, por lo mismo que {@code GymMemberRepository#marcaDelGimnasio}.</p>
     */
    @Query(value = """
            SELECT count(*) || ':' || coalesce(sum(extract(epoch FROM updated_at))::text, '-')
            FROM gym_plan
            WHERE tenant_id = :tenantId
            """, nativeQuery = true)
    String marcaDelGimnasio(@Param("tenantId") UUID tenantId);

    /**
     * Busca por nombre sin distinguir mayúsculas ni acentos de más.
     *
     * <p>Existe para el alta: "Pase Libre" y "pase libre" son el mismo arancel para quien
     * atiende el mostrador, y tener los dos vigentes haría que al cobrar no se sepa cuál
     * elegir. El índice único de la base lo garantiza; esto permite avisarlo con un mensaje
     * claro en vez de un error de base de datos.</p>
     */
    @Query("SELECT p FROM GymPlan p WHERE p.tenant.id = :tenantId AND p.isActive = true "
            + "AND LOWER(TRIM(p.name)) = LOWER(TRIM(:name))")
    Optional<GymPlan> findVigentePorNombre(@Param("tenantId") UUID tenantId, @Param("name") String name);
}
