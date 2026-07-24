package com.veltronik.v2.core.services;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.mappers.TenantMapper;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.SecurityUtils;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Servicio concreto para la entidad {@link Tenant} (cada Tenant = un negocio/sucursal).
 *
 * Hereda el CRUD genérico de {@link BaseServiceImpl} y solo implementa el "cableado"
 * (repository, mapper, nombre) + los casos especiales del negocio: el borrado total
 * y el listado de negocios del usuario logueado.
 *
 * @see BaseServiceImpl
 * @see TenantMapper
 */
@Service
@RequiredArgsConstructor
public class TenantService extends BaseServiceImpl<Tenant, TenantDTO, UUID> {

    private final TenantRepository tenantRepository;
    private final TenantMapper tenantMapper;
    private final TenantMembershipRepository membershipRepository;
    private final EntityManager entityManager;

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
     * Elimina un negocio y TODOS sus datos, sin importar cuántas tablas nuevas
     * hayan aparecido desde que se escribió este método.
     *
     * <p><b>Por qué es dinámico:</b> la versión anterior mantenía una lista fija de
     * tablas hijas. Cada vertical nuevo que agregaba una tabla con {@code tenant_id}
     * sin {@code ON DELETE CASCADE} (ej.: {@code cashier}, V36) rompía el borrado con
     * un 409 ("el registro está vinculado a otros datos"). Acá la lista sale del
     * propio esquema: <b>toda</b> tabla real de {@code public} con columna
     * {@code tenant_id} pierde las filas de este negocio. Un vertical futuro queda
     * cubierto solo, sin tocar este método.</p>
     *
     * <p><b>Cómo borra:</b> un único bloque PL/pgSQL que "pela la cebolla" (el mismo
     * patrón que la migración V40): recorre las tablas borrando por {@code tenant_id};
     * si una FK todavía bloquea un DELETE (padre con hijas vivas), lo saltea y lo
     * reintenta en la próxima pasada, hasta poder borrar la fila {@code tenant}.
     * Todo dentro de UNA transacción: si algo falla, rollback — el negocio jamás
     * queda a medio borrar.</p>
     *
     * <p><b>Seguridad:</b> los nombres de tabla salen de {@code information_schema}
     * (no de ningún input) y el id se interpola desde un {@link UUID} ya parseado —
     * su {@code toString()} solo produce hex y guiones, sin riesgo de inyección.</p>
     */
    @Override
    @Transactional
    public void delete(UUID id) {
        if (!tenantRepository.existsById(id)) {
            throw new EntityNotFoundException("Tenant", id);
        }
        entityManager.createNativeQuery(buildPurgeBlock(id)).executeUpdate();
    }

    /** Arma el bloque PL/pgSQL de purga para un negocio. Ver javadoc de {@link #delete}. */
    private static String buildPurgeBlock(UUID tenantId) {
        return """
            DO $$
            DECLARE
                -- "=" y no ":=" (equivalentes en PL/pgSQL): Hibernate confunde ":" con
                -- el prefijo de sus parámetros nombrados en las queries nativas.
                doomed uuid = '%s';
                pass int;
                tbl record;
            BEGIN
                FOR pass IN 1..10 LOOP
                    FOR tbl IN
                        SELECT c.table_name
                        FROM information_schema.columns c
                        JOIN information_schema.tables t
                          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
                        WHERE c.table_schema = 'public'
                          AND c.column_name  = 'tenant_id'
                          AND t.table_type   = 'BASE TABLE'
                    LOOP
                        BEGIN
                            EXECUTE format('DELETE FROM %%I WHERE tenant_id = $1', tbl.table_name)
                                USING doomed;
                        EXCEPTION WHEN foreign_key_violation THEN
                            NULL; -- otra tabla hija la referencia: próxima pasada
                        END;
                    END LOOP;

                    BEGIN
                        DELETE FROM tenant WHERE id = doomed;
                        EXIT; -- el negocio salió: borrado completo
                    EXCEPTION WHEN foreign_key_violation THEN
                        NULL; -- todavía queda alguna hija: otra pasada
                    END;
                END LOOP;

                IF EXISTS (SELECT 1 FROM tenant WHERE id = doomed) THEN
                    RAISE EXCEPTION 'Borrado incompleto: una FK impide eliminar el negocio';
                END IF;
            END $$;
            """.formatted(tenantId);
    }

    /** Negocios donde el usuario logueado tiene membresía, con su rol y grupo. */
    @Transactional(readOnly = true)
    public List<TenantDTO> findMyTenants() {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) return Collections.emptyList();

        List<TenantMembership> memberships = membershipRepository.findByUserId(userId);

        return memberships.stream().map(m -> {
            TenantDTO dto = tenantMapper.toDto(m.getTenant());
            dto.setRole(m.getRole().name().toLowerCase());
            dto.setType(m.getTenant().getBusinessType().name());
            // Grupo al que el dueño asignó la sucursal (null = sin grupo).
            if (m.getTenant().getGroup() != null) {
                dto.setGroupId(m.getTenant().getGroup().getId());
            }
            return dto;
        }).collect(Collectors.toList());
    }
}
