package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskPurchaseInputDTO;
import com.veltronik.v2.kiosk.dto.KioskPurchaseItemInputDTO;
import com.veltronik.v2.kiosk.entities.*;
import com.veltronik.v2.kiosk.repositories.KioskProductRepository;
import com.veltronik.v2.kiosk.repositories.KioskPurchaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Motor de compras: registrar una compra repone stock (movimientos PURCHASE por el libro mayor)
 * y actualiza el costo de cada producto (para que la rentabilidad refleje la realidad).
 *
 * <p>El costo se actualiza con UPDATE atómico ({@code updateCost}) — NO se muta el producto en
 * memoria, igual que el stock, para no pisar el cache.</p>
 */
@Service
public class KioskPurchaseService {

    private final KioskPurchaseRepository purchaseRepository;
    private final KioskProductRepository productRepository;
    private final KioskSupplierService supplierService;
    private final KioskProductService productService;
    private final KioskStockService stockService;

    public KioskPurchaseService(KioskPurchaseRepository purchaseRepository,
                                KioskProductRepository productRepository,
                                KioskSupplierService supplierService,
                                KioskProductService productService,
                                KioskStockService stockService) {
        this.purchaseRepository = purchaseRepository;
        this.productRepository = productRepository;
        this.supplierService = supplierService;
        this.productService = productService;
        this.stockService = stockService;
    }

    public List<KioskPurchase> findRecentForCurrentTenant() {
        return purchaseRepository.findTop100ByTenantIdOrderByPurchaseDateDescCreatedAtDesc(
                TenantContextHolder.getTenantId());
    }

    @Transactional
    public KioskPurchase register(KioskPurchaseInputDTO in) {
        KioskSupplier supplier = (in.getSupplierId() != null)
                ? supplierService.findByIdAndVerifyOwnership(in.getSupplierId()) : null;

        KioskPurchase purchase = new KioskPurchase();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        purchase.setTenant(tenant);
        purchase.setSupplier(supplier);
        purchase.setPurchaseDate(in.getPurchaseDate() != null ? in.getPurchaseDate() : LocalDate.now());
        purchase.setNotes(in.getNotes());
        purchase.setCreatedBy(SecurityUtils.getCurrentUserId());

        BigDecimal total = BigDecimal.ZERO;
        for (KioskPurchaseItemInputDTO itemIn : in.getItems()) {
            KioskProduct product = productService.findByIdAndVerifyOwnership(itemIn.getProductId());
            BigDecimal qty = itemIn.getQuantity();
            BigDecimal unitCost = itemIn.getUnitCost();
            BigDecimal subtotal = unitCost.multiply(qty).setScale(2, RoundingMode.HALF_UP);

            KioskPurchaseItem item = new KioskPurchaseItem();
            item.setProduct(product);
            item.setProductNameSnapshot(product.getName());
            item.setQuantity(qty);
            item.setUnitCost(unitCost);
            item.setSubtotal(subtotal);
            purchase.addItem(item);
            total = total.add(subtotal);
        }
        purchase.setTotal(total.setScale(2, RoundingMode.HALF_UP));

        KioskPurchase saved = purchaseRepository.save(purchase);

        // Reponer stock (libro mayor) + actualizar costo, ambos por UPDATE atómico.
        String reason = supplier != null ? "Compra a " + supplier.getName() : "Compra";
        for (KioskPurchaseItem item : saved.getItems()) {
            KioskProduct product = item.getProduct();
            if (product != null) {
                stockService.applyMovement(product, KioskStockMovementType.PURCHASE, item.getQuantity(), reason, null);
                productRepository.updateCost(product.getId(), item.getUnitCost());
            }
        }
        return saved;
    }
}
