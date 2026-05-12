package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/**
 * Entidad que vincula a un AppUser (Usuario Global) con un Tenant (Negocio).
 * 
 * Permite que un mismo usuario tenga múltiples roles en diferentes negocios.
 * Por ejemplo: ser OWNER del Tenant A, y STAFF del Tenant B.
 */
@Getter
@Setter
@Entity
@Table(name = "tenant_membership", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"user_id", "tenant_id"})
})
public class TenantMembership extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;
    
    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;
}
