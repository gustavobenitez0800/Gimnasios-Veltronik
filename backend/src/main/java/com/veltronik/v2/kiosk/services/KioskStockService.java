package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.entities.KioskProduct;
import com.veltronik.v2.kiosk.entities.KioskStockMovement;
import com.veltronik.v2.kiosk.entities.KioskStockMovementType;
import com.veltronik.v2.kiosk.repositories.KioskProductRepository;
import com.veltronik.v2.kiosk.repositories.KioskStockMovementRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Libro mayor del inventario. <b>Único punto que mueve stock</b> (alta cohesión): cada cambio
 * es un asiento inmutable + la actualización atómica del cache. El motor de ventas, los ajustes
 * y las anulaciones pasan todos por acá. Las compras a proveedor (Fase 2) también lo harán.
 *
 * <p><b>Concurrencia:</b> el cache {@code stockQuantity} se actualiza con un UPDATE atómico
 * en la BD ({@code applyStockDelta}); este service NUNCA muta el producto en memoria, así el
 * producto gestionado queda "no-dirty" y Hibernate no lo flushea pisando el UPDATE. Resultado:
 * dos ventas concurrentes del mismo producto restan ambas (sin lost update) sin bloquear el POS.</p>
 */
@Service
public class KioskStockService {

    private final KioskStockMovementRepository movementRepository;
    private final KioskProductRepository productRepository;

    public KioskStockService(KioskStockMovementRepository movementRepository,
                             KioskProductRepository productRepository) {
        this.movementRepository = movementRepository;
        this.productRepository = productRepository;
    }

    /**
     * Registra un asiento y actualiza el cache de stock de forma atómica.
     *
     * @param signedQty cantidad firmada: venta/merma negativas, compra/devolución positivas.
     */
    @Transactional
    public KioskStockMovement applyMovement(KioskProduct product, KioskStockMovementType type,
                                            BigDecimal signedQty, String reason, UUID saleId) {
        KioskStockMovement movement = new KioskStockMovement();
        movement.setTenant(product.getTenant());
        movement.setProduct(product);
        movement.setType(type);
        movement.setQuantity(signedQty);
        movement.setReason(reason);
        movement.setSaleId(saleId);
        movement.setCreatedBy(SecurityUtils.getCurrentUserId());
        movementRepository.save(movement);

        // UPDATE atómico del cache (no read-modify-write). NO tocar product en memoria.
        productRepository.applyStockDelta(product.getId(), signedQty);
        return movement;
    }

    /**
     * Ajuste manual por recuento físico: el cache pasa a {@code countedQuantity} y se registra
     * el delta. Operación poco frecuente y dirigida por el operador, por eso acá sí se escribe
     * el valor absoluto directo (la carrera con una venta simultánea es una realidad del recuento,
     * no un bug: el operador define el valor contado).
     */
    @Transactional
    public KioskStockMovement adjustToCounted(KioskProduct product, BigDecimal countedQuantity, String reason) {
        BigDecimal delta = countedQuantity.subtract(product.getStockQuantity());
        KioskStockMovement movement = new KioskStockMovement();
        movement.setTenant(product.getTenant());
        movement.setProduct(product);
        movement.setType(KioskStockMovementType.ADJUSTMENT);
        movement.setQuantity(delta);
        movement.setReason(reason != null && !reason.isBlank() ? reason.trim() : "Ajuste por recuento");
        movement.setCreatedBy(SecurityUtils.getCurrentUserId());
        movementRepository.save(movement);

        product.setStockQuantity(countedQuantity); // operación dirigida, sin concurrencia esperada
        productRepository.save(product);
        return movement;
    }

    public List<KioskStockMovement> recentForCurrentTenant() {
        return movementRepository.findRecentForTenant(TenantContextHolder.getTenantId(), PageRequest.of(0, 100));
    }

    public List<KioskStockMovement> historyForProduct(UUID productId) {
        // Acotado igual que recentForCurrentTenant: la pantalla muestra el historial reciente;
        // devolver el ledger completo de un producto de alta rotación no escala.
        return movementRepository.findByProductIdWithProduct(productId, PageRequest.of(0, 200));
    }
}
