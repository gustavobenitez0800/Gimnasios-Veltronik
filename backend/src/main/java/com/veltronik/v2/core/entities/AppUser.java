package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Entidad que representa un usuario global del sistema.
 *
 * Un AppUser es una cuenta que puede existir independientemente de un negocio.
 * La relación con los negocios (Tenants) se maneja a través de TenantMembership.
 */
@Getter
@Setter
@Entity
@Table(name = "app_user")
public class AppUser extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "first_name", length = 100)
    private String firstName;

    @Column(name = "last_name", length = 100)
    private String lastName;
    // ── Borrado de cuenta (V50) ──
    //
    // Lo que se borra es LA PERSONA: sus gimnasios se van con ella, no al revés. Por eso vive
    // acá y no en Tenant — un dueño con tres sucursales borra las tres.

    /** Cuándo pidió borrar la cuenta. Null = no pidió nada. */
    @Column(name = "deletion_requested_at")
    private java.time.LocalDateTime deletionRequestedAt;

    /**
     * Cuándo se borra todo, sin vuelta atrás.
     *
     * <p>Guardada y no calculada a propósito: si mañana la gracia pasa a 60 días, quien ya
     * pidió el borrado conserva la fecha que se le prometió. Cambiar la política no puede
     * correrle la fecha a alguien que ya está esperando.</p>
     */
    @Column(name = "deletion_scheduled_at")
    private java.time.LocalDateTime deletionScheduledAt;

}