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
