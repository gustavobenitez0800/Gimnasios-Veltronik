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
}


