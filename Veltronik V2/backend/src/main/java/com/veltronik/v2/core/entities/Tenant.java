package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Entidad raíz del sistema Multitenant.
 *
 * Cada Tenant representa un NEGOCIO registrado en Veltronik (un gimnasio,
 * una peluquería, un restaurante, etc.). Toda la información del sistema
 * cuelga directamente o indirectamente de esta entidad.
 *
 * <p>Hereda de {@link BaseEntity} (no de TenantAwareEntity) porque un
 * Tenant no pertenece a otro Tenant.</p>
 *
 * <p><b>Regla del Codex:</b> "Nada existe fuera de un Tenant."</p>
 */
@Getter
@Setter
@Entity
@Table(name = "tenant")
public class Tenant extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "business_type", nullable = false, length = 20)
    private BusinessType businessType;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;
}
