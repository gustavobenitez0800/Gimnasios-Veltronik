package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

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
public class AppUser extends BaseEntity implements UserDetails {

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "first_name", length = 100)
    private String firstName;

    @Column(name = "last_name", length = 100)
    private String lastName;

    // --- Métodos de UserDetails de Spring Security ---

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // Los roles ahora son dependientes del Tenant en la tabla TenantMembership.
        // A nivel global de Spring Security, el usuario básico no tiene authorities fijas,
        // confiaremos en los claims del JWT.
        return List.of();
    }

    @Override
    public String getPassword() {
        return this.passwordHash;
    }

    @Override
    public String getUsername() {
        return this.email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
