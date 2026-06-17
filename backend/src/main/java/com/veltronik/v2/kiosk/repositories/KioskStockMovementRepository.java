package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskStockMovement;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KioskStockMovementRepository extends JpaRepository<KioskStockMovement, UUID> {

    // JOIN FETCH del producto (asociación EAGER + open-in-view=false → mapear en el controller).

    /** Historial de movimientos de un producto (auditoría del stock). */
    @Query("SELECT m FROM KioskStockMovement m JOIN FETCH m.product "
            + "WHERE m.product.id = :productId ORDER BY m.createdAt DESC")
    List<KioskStockMovement> findByProductIdWithProduct(@Param("productId") UUID productId);

    /** Últimos movimientos del tenant para la pantalla de inventario (límite por Pageable). */
    @Query("SELECT m FROM KioskStockMovement m JOIN FETCH m.product "
            + "WHERE m.tenant.id = :tenantId ORDER BY m.createdAt DESC")
    List<KioskStockMovement> findRecentForTenant(@Param("tenantId") UUID tenantId, Pageable pageable);

    /** ¿El producto ya tiene historial de stock? (protege contra el hard-delete con ledger). */
    boolean existsByProductId(UUID productId);
}
