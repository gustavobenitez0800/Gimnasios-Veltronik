package com.veltronik.v2.core.entities;

import com.fasterxml.jackson.annotation.JsonIgnore;
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

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    /**
     * "DNI de equipo" (ADR-002, Fase 0 de la V3): id de la instalación que ORIGINÓ este
     * registro. Nulo cuando la escritura no viene de un equipo identificado (web, webhooks,
     * jobs). Se estampa UNA vez al insertar y no se toca más ({@code updatable = false}):
     * la procedencia de un registro no cambia aunque el registro se edite.
     */
    @Column(name = "origin_device_id", updatable = false)
    private java.util.UUID originDeviceId;

    /**
     * QUIÉN hizo esto: el cajero que estaba en el turno cuando se creó el registro.
     *
     * <p>Complementa a {@link #originDeviceId}, que dice desde qué MÁQUINA vino. Las dos
     * juntas contestan la pregunta que un dueño hace el día que falta plata en la caja:
     * "¿quién cobró esto y desde dónde?".</p>
     *
     * <p>Nulo cuando no hay persona de mostrador detrás: lo que hace el dueño desde la web,
     * los webhooks de Mercado Pago, los jobs. Y en todo lo anterior a esta función.</p>
     */
    @Column(name = "performed_by_cashier_id", updatable = false)
    private java.util.UUID performedByCashierId;

    /**
     * Hook de JPA: antes de insertar, estampa la procedencia de la request actual — de qué
     * equipo vino y quién estaba en el turno.
     *
     * <p>Los dos son {@code updatable = false}: la autoría de un registro no cambia aunque
     * después alguien lo edite. Si mañana hace falta saber quién editó qué, eso es un
     * historial aparte, no pisar el dato original.</p>
     *
     * <p>Solo se asigna si nadie lo puso explícitamente, para que un caso especial pueda
     * estampar a mano sin que el hook lo pise.</p>
     */
    @PrePersist
    protected void stampOrigin() {
        if (this.originDeviceId == null) {
            this.originDeviceId = com.veltronik.v2.core.security.DeviceContextHolder.getDeviceId();
        }
        if (this.performedByCashierId == null) {
            this.performedByCashierId = com.veltronik.v2.core.security.CashierContextHolder.getCashierId();
        }
    }
}
