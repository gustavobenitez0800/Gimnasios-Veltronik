package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;

import java.util.UUID;

/**
 * Clase base para entidades que PERTENECEN a un negocio (Tenant).
 *
 * Implementa el "Aislamiento Paranoico" del Codex (Mandamiento #3):
 * - Toda entidad que herede de esta clase tendrá una columna {@code tenant_id} obligatoria.
 * - Hibernate inyectará automáticamente un {@code WHERE tenant_id = ?} en todas las
 *   consultas mediante {@link Filter}, activado desde el filtro JWT del request.
 *
 * <p><b>Regla de oro:</b> Si la entidad pertenece a un Gym, Salon, Resto o cualquier
 * vertical futura → hereda de {@code TenantAwareEntity}.</p>
 * <p>Si la entidad es global del sistema (como {@link Tenant} en sí) → hereda de {@link BaseEntity}.</p>
 *
 * @see BaseEntity
 * @see Tenant
 */
@Getter
@Setter
@MappedSuperclass
@FilterDef(
        name = "tenantFilter",
        parameters = @ParamDef(name = "tenantId", type = UUID.class)
)
@Filter(
        name = "tenantFilter",
        condition = "tenant_id = :tenantId"
)
public abstract class TenantAwareEntity extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;
}
