package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Cashier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CashierRepository extends JpaRepository<Cashier, UUID> {

    /** Los del turno: lo que se ofrece en la pantalla de cambio de turno. */
    List<Cashier> findByTenantIdAndActiveTrueOrderByNameAsc(UUID tenantId);

    /** Todos, incluidos los dados de baja (para la gestión del dueño). */
    List<Cashier> findByTenantIdOrderByActiveDescNameAsc(UUID tenantId);

    /** Chequeo barato que corre en cada request con turno abierto (ver CashierContextFilter). */
    boolean existsByIdAndTenantIdAndActiveTrue(UUID id, UUID tenantId);

    /**
     * Para el índice único por nombre dentro de la sucursal: dos "Mariana" en la misma
     * pantalla de turno serían una moneda al aire.
     */
    @Query("SELECT c FROM Cashier c WHERE c.tenant.id = :tenantId AND LOWER(c.name) = LOWER(:name)")
    Optional<Cashier> findByTenantIdAndNameIgnoreCase(@Param("tenantId") UUID tenantId, @Param("name") String name);
}
