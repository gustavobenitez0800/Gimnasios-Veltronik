package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Compra a un proveedor (remito/factura). Raíz de agregado: sus {@link KioskPurchaseItem} se
 * persisten en cascada (bidireccional, el FK viaja en el INSERT del hijo). Registrar una compra
 * repone stock (movimientos PURCHASE) y actualiza el costo de los productos.
 */
@Entity
@Table(name = "kiosk_purchase")
@Getter
@Setter
public class KioskPurchase extends TenantAwareEntity {

    /** Proveedor. Opcional (compra suelta). EAGER (open-in-view=false) + @BatchSize en el proveedor. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "supplier_id")
    private KioskSupplier supplier;

    @Column(name = "purchase_date", nullable = false)
    private LocalDate purchaseDate;

    @Column(nullable = false)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_by")
    private UUID createdBy;

    @OneToMany(mappedBy = "purchase", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @BatchSize(size = 64)
    private List<KioskPurchaseItem> items = new ArrayList<>();

    public void addItem(KioskPurchaseItem item) {
        item.setTenant(getTenant());
        item.setPurchase(this);
        items.add(item);
    }
}
