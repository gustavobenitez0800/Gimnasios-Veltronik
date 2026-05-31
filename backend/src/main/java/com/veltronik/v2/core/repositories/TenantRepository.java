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
     * Busca tenants a desactivar por el Kill Switch (cron): trial vencido Y SIN una
     * suscripción válida que les dé acceso.
     *
     * <p><b>Por qué el NOT EXISTS es crítico:</b> el trial ({@code trial_ends_at}) NO es
     * la única fuente de "acceso pago". Un cliente que paga por Mercado Pago tiene su
     * acceso en la tabla {@code subscriptions}. Sin este chequeo, el cron desactivaría
     * a clientes que pagan religiosamente solo porque su trial original venció —
     * exactamente lo que pasaría con los gimnasios más grandes (POPEYE, SEKUR).</p>
     *
     * <p>Se considera "suscripción válida" cuando: está {@code active}; o está
     * {@code past_due} pero dentro del período de gracia; o está {@code canceled} pero
     * el período pago en curso todavía no terminó. Ante la duda, NO se bloquea.</p>
     */
    @Query("""
            SELECT t FROM Tenant t
            WHERE t.active = true
              AND t.trialEndsAt IS NOT NULL
              AND t.trialEndsAt < :now
              AND NOT EXISTS (
                  SELECT 1 FROM Subscription s
                  WHERE s.tenant = t
                    AND (
                         s.status = 'active'
                      OR (s.status = 'past_due' AND s.gracePeriodEndsAt IS NOT NULL AND s.gracePeriodEndsAt > :now)
                      OR (s.status = 'canceled' AND s.currentPeriodEnd IS NOT NULL AND s.currentPeriodEnd > :now)
                    )
              )
            """)
    List<Tenant> findExpiredActiveTenants(@Param("now") LocalDateTime now);
}
