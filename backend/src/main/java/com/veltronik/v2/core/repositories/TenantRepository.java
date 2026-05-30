package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Repositorio JPA para la entidad {@link Tenant}.
 *
 * Equivalente moderno de {@code PaisAplicativoFacade.findAll()} del SIG JEE7,
 * pero aquí Spring Data genera automáticamente las consultas SQL a partir
 * del nombre del método (Query Derivation).
 *
 * @see Tenant
 */
@Repository
public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    /** Busca todos los negocios que estén activos en la plataforma. */
    List<Tenant> findByActiveTrue();

    /**
     * Busca tenants activos cuyo trial/suscripción ya expiró.
     * Usado por el CronJob de Kill Switch — empuja el filtro a la BD (evita cargar todo a memoria).
     */
    @Query("SELECT t FROM Tenant t WHERE t.active = true AND t.trialEndsAt IS NOT NULL AND t.trialEndsAt < :now")
    List<Tenant> findExpiredActiveTenants(@Param("now") LocalDateTime now);
}
