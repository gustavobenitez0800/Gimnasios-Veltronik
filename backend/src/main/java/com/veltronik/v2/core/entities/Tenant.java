package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Entidad raíz del sistema Multitenant.
 *
 * Cada Tenant representa un NEGOCIO registrado en Veltronik (un gimnasio,
 * una peluquería, un restaurante, etc.). Toda la información del sistema
 * cuelga directamente o indirectamente de esta entidad.
 *
 * <p>Equivalente moderno de {@code Empresa.java} del sistema SIG JEE7
 * y de la tabla {@code gyms} del Gimnasio Veltronik V1.</p>
 *
 * <p>Hereda de {@link BaseEntity} (no de TenantAwareEntity) porque un
 * Tenant no pertenece a otro Tenant.</p>
 *
 * <p><b>Regla del Codex:</b> "Nada existe fuera de un Tenant."</p>
 *
 * @see TenantAwareEntity
 * @see BusinessType
 */
@Getter
@Setter
@Entity
@Table(name = "tenant")
public class Tenant extends BaseEntity {

    /** Nombre comercial del negocio (equivalente a nombreFantasia en Empresa.java). */
    @Column(nullable = false)
    private String name;

    /** Tipo de vertical: GYM, SALON, RESTAURANT, OTHER. */
    @Enumerated(EnumType.STRING)
    @Column(name = "business_type", nullable = false, length = 20)
    private BusinessType businessType;

    /** Dirección física del negocio. */
    @Column(length = 255)
    private String address;

    /** Teléfono de contacto del negocio. */
    @Column(length = 50)
    private String phone;

    /** Email de contacto del negocio (no confundir con el email del usuario/dueño). */
    @Column(length = 150)
    private String email;

    /** URL del logo del negocio (almacenado en Supabase Storage). */
    @Column(name = "logo_url")
    private String logoUrl;

    /** Fecha en que finaliza el período de prueba gratuita de 30 días. */
    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    /** Estado general del negocio en la plataforma. */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
