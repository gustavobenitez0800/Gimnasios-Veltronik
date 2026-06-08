package com.veltronik.v2.core.services;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.mappers.TenantMapper;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Servicio concreto para la entidad {@link Tenant}.
 *
 * Esta es la primera implementación real del patrón genérico CRUD.
 * Equivale al {@code PaisAplicativoFacade} del SIG JEE7: hereda toda
 * la lógica CRUD de {@link BaseServiceImpl} y solo necesita implementar
 * los 4 métodos abstractos de "cableado" (repository, mapper, nombre).
 *
 * <p><b>¿Para qué sirve esto?</b> Cuando un Junior necesite crear el
 * servicio de "Socios" para el módulo Gym, solo tiene que copiar esta
 * estructura reemplazando Tenant por GymMember y TenantDTO por GymMemberDTO.</p>
 *
 * @see BaseServiceImpl
 * @see TenantMapper
 */
@Service
@RequiredArgsConstructor
public class TenantService extends BaseServiceImpl<Tenant, TenantDTO, UUID> {

    private final TenantRepository tenantRepository;
    private final TenantMapper tenantMapper;
    private final com.veltronik.v2.core.repositories.TenantMembershipRepository membershipRepository;
    private final jakarta.persistence.EntityManager entityManager;

    @Override
    protected String getEntityName() {
        return "Tenant";
    }

    @Override
    protected JpaRepository<Tenant, UUID> getRepository() {
        return tenantRepository;
    }

    @Override
    protected TenantDTO toDto(Tenant entity) {
        return tenantMapper.toDto(entity);
    }

    @Override
    protected Tenant toEntity(TenantDTO dto) {
        return tenantMapper.toEntity(dto);
    }

    @Override
    protected void updateEntity(TenantDTO dto, Tenant entity) {
        tenantMapper.updateEntityFromDto(dto, entity);
    }
    
    /**
     * Elimina un negocio y TODOS sus datos. Sobrescribe el {@code delete} genérico porque
     * {@code tenantRepository.delete()} solo borraba la fila {@code tenant} y fallaba: varias
     * tablas hijas referencian {@code tenant} SIN {@code ON DELETE CASCADE}
     * (ej. {@code tenant_membership}, {@code tenant_payment}) → la FK rechazaba el borrado.
     *
     * <p>Estrategia robusta: borra explícitamente cada tabla hija por {@code tenant_id}, en
     * orden seguro de FKs (hijas → padres), dentro de una transacción. Incluye tablas legacy
     * de migraciones viejas y verifica que la tabla exista antes de borrar (así una tabla
     * inexistente no aborta la transacción). Si algo falla, hace rollback y el negocio NO
     * queda a medio borrar.</p>
     */
    @Override
    @org.springframework.transaction.annotation.Transactional
    public void delete(java.util.UUID id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new com.veltronik.v2.core.exceptions.EntityNotFoundException("Tenant", id));

        // Orden: primero las que referencian socios/clases, luego socios/clases, luego las
        // que referencian solo al tenant. Cubre nombres actuales y legacy (V2/V4/V6/V10/V13).
        String[] childTables = {
            "class_booking",      // reservas de clases (refs gym_class, socios)
            "access_log",         // accesos/check-ins (refs socios)
            "member_payment",     // pagos legacy (V4)
            "payments",           // pagos legacy (V6)
            "gym_payments",       // pagos actuales (refs socios SET NULL)
            "gym_class",          // clases (V13)
            "gym_member",         // socios legacy (V2)
            "gym_members",        // socios actuales (V10)
            "members",            // socios legacy (V6)
            "subscriptions",      // suscripciones del negocio
            "tenant_payment",     // pagos de la plataforma (MP)
            "tenant_membership"   // equipo (membresías usuario↔negocio)
        };
        for (String table : childTables) {
            deleteByTenant(table, id);
        }

        tenantRepository.delete(tenant);
    }

    /** Borra las filas de {@code table} para el tenant dado, solo si la tabla existe. */
    private void deleteByTenant(String table, java.util.UUID tenantId) {
        Boolean exists = (Boolean) entityManager.createNativeQuery(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables " +
                "WHERE table_schema = 'public' AND table_name = :name)")
                .setParameter("name", table)
                .getSingleResult();
        if (Boolean.TRUE.equals(exists)) {
            // `table` proviene de una lista fija interna (no input del usuario) → sin riesgo de inyección.
            entityManager.createNativeQuery("DELETE FROM " + table + " WHERE tenant_id = :t")
                    .setParameter("t", tenantId)
                    .executeUpdate();
        }
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<TenantDTO> findMyTenants() {
        java.util.UUID userId = com.veltronik.v2.core.security.SecurityUtils.getCurrentUserId();
        if (userId == null) return java.util.Collections.emptyList();
        
        java.util.List<com.veltronik.v2.core.entities.TenantMembership> memberships = membershipRepository.findByUserId(userId);
        
        return memberships.stream().map(m -> {
            TenantDTO dto = tenantMapper.toDto(m.getTenant());
            dto.setRole(m.getRole().name().toLowerCase());
            dto.setType(m.getTenant().getBusinessType().name());
            // Grupo al que el dueño asignó la sucursal (null = sin grupo).
            if (m.getTenant().getGroup() != null) {
                dto.setGroupId(m.getTenant().getGroup().getId());
            }
            return dto;
        }).collect(java.util.stream.Collectors.toList());
    }
}
