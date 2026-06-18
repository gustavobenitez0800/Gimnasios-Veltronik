package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

/** Proveedor / distribuidor del kiosco. {@code @BatchSize}: listar compras carga proveedores en lotes. */
@Entity
@Table(name = "kiosk_supplier")
@Getter
@Setter
@BatchSize(size = 64)
public class KioskSupplier extends TenantAwareEntity {

    @Column(nullable = false)
    private String name;

    @Column(length = 30)
    private String phone;

    @Column(length = 20)
    private String cuit;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
