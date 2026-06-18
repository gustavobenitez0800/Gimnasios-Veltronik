package com.veltronik.v2.kiosk.repositories;

import com.veltronik.v2.kiosk.entities.KioskPurchase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface KioskPurchaseRepository extends JpaRepository<KioskPurchase, UUID> {

    /** Compras del tenant (más recientes primero) para la pantalla de proveedores. */
    List<KioskPurchase> findTop100ByTenantIdOrderByPurchaseDateDescCreatedAtDesc(UUID tenantId);

    /** ¿El proveedor ya tiene compras? (protege contra el hard-delete con historial). */
    boolean existsBySupplierId(UUID supplierId);
}
