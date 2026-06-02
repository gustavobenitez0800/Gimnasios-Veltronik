package com.veltronik.v2.core.repositories;

import com.veltronik.v2.core.entities.TenantMembership;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantMembershipRepository extends JpaRepository<TenantMembership, UUID> {
    
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"tenant"})
    List<TenantMembership> findByUserId(UUID userId);
    
    Optional<TenantMembership> findByUserIdAndTenantId(UUID userId, UUID tenantId);
    List<TenantMembership> findByTenantIdAndActiveTrue(UUID tenantId);
    List<TenantMembership> findByTenantId(UUID tenantId);

    /**
     * Verifica de forma eficiente (sin hidratar la entidad) que el usuario
     * tenga una membresía ACTIVA en el tenant. Usado por TenantContextFilter
     * para autorizar el header X-Tenant-ID en cada request.
     */
    boolean existsByUserIdAndTenantIdAndActiveTrue(UUID userId, UUID tenantId);

    /**
     * Trae la membresía ACTIVA del usuario en el tenant (incluye el {@code role}). La usa
     * TenantContextFilter para, en una sola consulta, autorizar el X-Tenant-ID e inyectar el
     * rol como authority de Spring para el control de acceso por método ({@code @PreAuthorize}).
     */
    Optional<TenantMembership> findByUserIdAndTenantIdAndActiveTrue(UUID userId, UUID tenantId);

    /**
     * Trae las membresías ACTIVAS de un tenant junto con su {@link com.veltronik.v2.core.entities.AppUser}
     * en UNA sola consulta SQL mediante {@code JOIN FETCH}.
     *
     * <p>Resuelve el {@code LazyInitializationException} (con {@code open-in-view=false},
     * la sesión se cierra al volver del repositorio y el proxy lazy de AppUser explota)
     * SIN caer en el problema N+1 que provocaría un simple {@code @Transactional} en el
     * servicio (1 query para las membresías + 1 por cada usuario). Acá, el usuario ya
     * viene inicializado en la misma consulta.</p>
     *
     * <p>Nota: el filtro {@code m.active = true} se hace en la BD, evitando traer
     * membresías inactivas a memoria.</p>
     */
    @Query("SELECT m FROM TenantMembership m JOIN FETCH m.user WHERE m.tenant.id = :tenantId AND m.active = true")
    List<TenantMembership> findActiveByTenantIdWithUser(@Param("tenantId") UUID tenantId);
}
