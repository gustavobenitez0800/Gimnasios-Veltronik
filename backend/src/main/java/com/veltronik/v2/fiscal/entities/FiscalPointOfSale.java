package com.veltronik.v2.fiscal.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

/** Punto de venta registrado en ARCA para el tenant (el número que viaja en cada comprobante). */
@Entity
@Table(name = "fiscal_point_of_sale", uniqueConstraints = {
        @UniqueConstraint(name = "ux_fiscal_pos_number", columnNames = {"tenant_id", "number"})
})
@Getter
@Setter
public class FiscalPointOfSale extends TenantAwareEntity {

    @Column(nullable = false)
    private Integer number;

    @Column(length = 120)
    private String description;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}
