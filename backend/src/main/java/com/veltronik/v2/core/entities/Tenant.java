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

    /** Vertical del negocio. Ver {@link BusinessType} para los valores soportados. */
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

    /**
     * Logo del gimnasio, guardado como data URI (imagen ya recortada y comprimida por
     * el navegador). Es {@code TEXT} —no VARCHAR(255)— porque un data URI de 256px
     * ronda los 30-60 KB; la columna original solo entraba una URL corta, que era el
     * diseño de cuando el plan era subir el archivo a un bucket aparte.
     */
    @Column(name = "logo_url", columnDefinition = "text")
    private String logoUrl;

    /**
     * Emoji que el dueño eligió como identidad cuando no sube una imagen. Es
     * excluyente con {@link #logoUrl}: elegir uno borra el otro.
     */
    @Column(name = "logo_emoji", length = 16)
    private String logoEmoji;

    /** Fecha en que finaliza el período de prueba gratuita de 30 días. */
    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    /** Estado general del negocio en la plataforma. */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /**
     * Grupo al que el dueño asignó esta sucursal (opcional). Null = "Sin grupo".
     * LAZY: no se carga salvo que se pida explícitamente, para no penalizar las
     * consultas que no necesitan el grupo.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private TenantGroup group;
}
