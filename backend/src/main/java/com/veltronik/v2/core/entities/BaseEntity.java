package com.veltronik.v2.core.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.GenericGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Clase base abstracta para TODAS las entidades del sistema Veltronik.
 *
 * Proporciona de forma automática:
 * - Un UUID como clave primaria (seguridad anti-enumeración). Desde la Fase 0 de la V3,
 *   el UUID puede venir PRE-ASIGNADO (generado en el dispositivo) para la idempotencia
 *   del sync engine; si es nulo se genera en el servidor, como siempre
 *   (ver {@link AssignableUuidGenerator}).
 * - Campos de auditoría {@code createdAt} y {@code updatedAt} gestionados por JPA.
 *
 * <p><b>Uso:</b> Toda entidad nueva DEBE heredar de esta clase o de
 * {@link TenantAwareEntity} (si pertenece a un negocio/tenant).</p>
 *
 * @see TenantAwareEntity
 */
@Getter
@Setter
@MappedSuperclass
public abstract class BaseEntity {

    @Id
    @GeneratedValue(generator = "assignable-uuid")
    @GenericGenerator(name = "assignable-uuid", type = AssignableUuidGenerator.class)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Hook de JPA: se ejecuta automáticamente ANTES de insertar un registro nuevo.
     * Establece las fechas de creación y actualización al momento actual.
     */
    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    /**
     * Hook de JPA: se ejecuta automáticamente ANTES de actualizar un registro existente.
     * Actualiza únicamente la fecha de última modificación.
     */
    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
