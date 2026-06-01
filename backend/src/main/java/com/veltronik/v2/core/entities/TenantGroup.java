package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Grupo de sucursales/negocios de un mismo dueño, para organizar el Lobby cuando
 * tiene muchas sucursales o de distintos rubros.
 *
 * <p><b>Por qué vive en {@code core/}:</b> agrupar es transversal — un grupo puede
 * contener negocios de cualquier vertical (gym, pádel, fútbol 5, salón). No pertenece
 * a un Tenant (los CONTIENE), sino a un usuario dueño ({@code ownerUserId}).</p>
 *
 * <p>Relación con Tenant: {@code tenant.group_id} (FK nullable). Un tenant sin grupo
 * (group_id = null) se muestra como "Sin grupo" — el comportamiento por defecto.</p>
 */
@Getter
@Setter
@Entity
@Table(name = "tenant_group")
public class TenantGroup extends BaseEntity {

    /** Usuario dueño al que pertenece el grupo (no es multitenant: agrupa por dueño). */
    @Column(name = "owner_user_id", nullable = false)
    private java.util.UUID ownerUserId;

    /** Nombre del grupo (ej. "Sucursales Gimnasio", "Canchas Zona Norte"). */
    @Column(nullable = false, length = 120)
    private String name;

    /** Color opcional para distinguirlo visualmente en el lobby. */
    @Column(length = 20)
    private String color;

    /** Orden de visualización entre los grupos del dueño. */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;
}
