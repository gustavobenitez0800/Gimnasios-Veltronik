package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Rubro de la góndola (Bebidas, Cigarrillos, Golosinas, Almacén, Servicios...).
 * Agrupa productos para la búsqueda rápida del POS y los reportes por categoría.
 */
@Entity
@Table(name = "kiosk_category")
@Getter
@Setter
public class KioskCategory extends TenantAwareEntity {

    @Column(nullable = false, length = 120)
    private String name;

    /** Orden en el que se listan los rubros en el POS. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
