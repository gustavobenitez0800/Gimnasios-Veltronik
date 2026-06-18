package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface KioskProductRepository extends JpaRepository<KioskProduct, UUID> {

    // Las listas usan LEFT JOIN FETCH de la categoría: la asociación es EAGER (open-in-view=false),
    // y sin el fetch dispararía un select por producto (N+1). Mismo patrón que la grilla de canchas.

    @Query("SELECT p FROM KioskProduct p LEFT JOIN FETCH p.category WHERE p.tenant.id = :tenantId ORDER BY p.name ASC")
    List<KioskProduct> findAllForTenant(@Param("tenantId") UUID tenantId);

    @Query("SELECT p FROM KioskProduct p LEFT JOIN FETCH p.category "
            + "WHERE p.tenant.id = :tenantId AND p.active = true ORDER BY p.name ASC")
    List<KioskProduct> findActiveForTenant(@Param("tenantId") UUID tenantId);

    /** Búsqueda por código de barras del scanner (único por tenant). */
    Optional<KioskProduct> findByTenantIdAndBarcode(UUID tenantId, String barcode);

    /**
     * Aplica un delta firmado al cache de stock con un UPDATE atómico en la BD.
     *
     * <p><b>Por qué no load-modify-save:</b> bajo dos ventas concurrentes del mismo producto,
     * leer-modificar-guardar pierde una de las dos restas (lost update). Dejar que la BD haga
     * la aritmética ({@code stock = stock + delta}) es seguro sin bloquear el POS.</p>
     */
    @Modifying
    @Query("UPDATE KioskProduct p SET p.stockQuantity = p.stockQuantity + :delta, p.updatedAt = CURRENT_TIMESTAMP WHERE p.id = :id")
    void applyStockDelta(@Param("id") UUID id, @Param("delta") BigDecimal delta);

    /** Actualiza el costo del producto (lo hace una compra). UPDATE atómico para no pisar el stock. */
    @Modifying
    @Query("UPDATE KioskProduct p SET p.costPrice = :cost, p.updatedAt = CURRENT_TIMESTAMP WHERE p.id = :id")
    void updateCost(@Param("id") UUID id, @Param("cost") BigDecimal cost);

    /** Productos en o por debajo del mínimo (alerta de reposición). Ignora servicios. */
    @Query("""
            SELECT p FROM KioskProduct p
            LEFT JOIN FETCH p.category
            WHERE p.tenant.id = :tenantId
              AND p.active = true
              AND p.service = false
              AND p.stockQuantity <= p.minStock
            ORDER BY p.stockQuantity ASC
            """)
    List<KioskProduct> findLowStock(@Param("tenantId") UUID tenantId);
}
