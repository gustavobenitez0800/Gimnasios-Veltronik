package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Cajero del mostrador (Fase 1, ladrillo 5): opera con PIN, sin cuenta de Google ni
 * email. Clasificación CONFIG ↓ (docs/DATA-CLASSIFICATION.md): el dueño los gestiona
 * en la nube y el sync engine los baja al local — el login diario no necesita internet.
 *
 * <p>El PIN vive SOLO como hash BCrypt. Jamás se devuelve ni viaja en claro (el hash sí
 * baja al local vía sync: es lo que permite verificar el PIN offline).</p>
 */
@Getter
@Setter
@Entity
@Table(name = "cashier")
public class Cashier extends TenantAwareEntity {

    public enum Role { CAJERO, ENCARGADO }

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "pin_hash", nullable = false, length = 72)
    private String pinHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role = Role.CAJERO;

    /** Desactivar nunca borra: el historial que lo referencie sigue íntegro. */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
