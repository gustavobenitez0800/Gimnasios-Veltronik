package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskProductInputDTO;
import com.veltronik.v2.kiosk.dto.KioskStockAdjustmentInputDTO;
import com.veltronik.v2.kiosk.entities.KioskCategory;
import com.veltronik.v2.kiosk.entities.KioskProduct;
import com.veltronik.v2.kiosk.entities.KioskStockMovement;
import com.veltronik.v2.kiosk.entities.KioskStockMovementType;
import com.veltronik.v2.kiosk.repositories.KioskProductRepository;
import com.veltronik.v2.kiosk.repositories.KioskStockMovementRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * CRUD de productos + lookup por código de barras para el POS.
 *
 * <p>El stock NO se edita acá: el alta acepta un stock inicial (que entra como movimiento de
 * inventario), pero después el stock solo se mueve por ventas/ajustes vía {@link KioskStockService}.
 * Editar un producto nunca pisa su stock.</p>
 */
@Service
public class KioskProductService {

    private static final String BARCODE_TAKEN = "Ya existe un producto con ese código de barras.";

    private final KioskProductRepository productRepository;
    private final KioskStockMovementRepository movementRepository;
    private final KioskCategoryService categoryService;
    private final KioskStockService stockService;

    public KioskProductService(KioskProductRepository productRepository,
                               KioskStockMovementRepository movementRepository,
                               KioskCategoryService categoryService,
                               KioskStockService stockService) {
        this.productRepository = productRepository;
        this.movementRepository = movementRepository;
        this.categoryService = categoryService;
        this.stockService = stockService;
    }

    public List<KioskProduct> findAllForCurrentTenant() {
        return productRepository.findAllForTenant(TenantContextHolder.getTenantId());
    }

    public List<KioskProduct> findActiveForCurrentTenant() {
        return productRepository.findActiveForTenant(TenantContextHolder.getTenantId());
    }

    public List<KioskProduct> findLowStockForCurrentTenant() {
        return productRepository.findLowStock(TenantContextHolder.getTenantId());
    }

    public KioskProduct findByIdAndVerifyOwnership(UUID id) {
        KioskProduct product = productRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Producto no encontrado"));
        if (!product.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este producto");
        }
        return product;
    }

    /** Lookup por barcode del scanner. 404 si no hay producto con ese código. */
    public KioskProduct findByBarcodeOrThrow(String barcode) {
        return productRepository.findByTenantIdAndBarcode(TenantContextHolder.getTenantId(), barcode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No hay un producto con ese código de barras"));
    }

    @Transactional
    public KioskProduct create(KioskProductInputDTO in) {
        KioskProduct product = new KioskProduct();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        product.setTenant(tenant);
        applyFields(product, in);

        KioskProduct saved = saveCheckingBarcode(product);

        // Stock inicial → entra como movimiento (mantiene la invariante ledger = cache).
        BigDecimal initial = in.getStockQuantity();
        if (initial != null && initial.compareTo(BigDecimal.ZERO) > 0 && !saved.isService()) {
            stockService.applyMovement(saved, KioskStockMovementType.ADJUSTMENT, initial, "Stock inicial", null);
            saved.setStockQuantity(initial); // reflejar en la respuesta (producto nuevo, sin concurrencia)
        }
        return saved;
    }

    @Transactional
    public KioskProduct update(UUID id, KioskProductInputDTO in) {
        KioskProduct product = findByIdAndVerifyOwnership(id);
        applyFields(product, in); // OJO: applyFields NO toca stockQuantity
        return saveCheckingBarcode(product);
    }

    /** Ajuste manual de stock por recuento físico. Orquesta producto (ownership) + ledger. */
    @Transactional
    public KioskStockMovement adjustStock(KioskStockAdjustmentInputDTO in) {
        KioskProduct product = findByIdAndVerifyOwnership(in.getProductId());
        return stockService.adjustToCounted(product, in.getCountedQuantity(), in.getReason());
    }

    /** Historial de movimientos de un producto (verifica ownership). */
    public List<KioskStockMovement> movementHistory(UUID productId) {
        findByIdAndVerifyOwnership(productId);
        return stockService.historyForProduct(productId);
    }

    /**
     * Borrado seguro: si el producto ya tiene historial de inventario, NO se borra (se perdería
     * el ledger) → se pide desactivarlo. Sin historial, se elimina.
     */
    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        KioskProduct product = findByIdAndVerifyOwnership(id);
        if (movementRepository.existsByProductId(product.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El producto tiene historial de ventas/movimientos. Desactivalo en lugar de borrarlo.");
        }
        productRepository.delete(product);
    }

    private void applyFields(KioskProduct p, KioskProductInputDTO in) {
        if (in.getCategoryId() != null) {
            KioskCategory category = categoryService.findByIdAndVerifyOwnership(in.getCategoryId());
            p.setCategory(category);
        }
        if (in.getName() != null) p.setName(in.getName().trim());
        if (in.getBarcode() != null) p.setBarcode(in.getBarcode().isBlank() ? null : in.getBarcode().trim());
        if (in.getCostPrice() != null) p.setCostPrice(in.getCostPrice());
        if (in.getSalePrice() != null) p.setSalePrice(in.getSalePrice());
        if (in.getMinStock() != null) p.setMinStock(in.getMinStock());
        if (in.getWeighable() != null) p.setWeighable(in.getWeighable());
        if (in.getService() != null) p.setService(in.getService());
        if (in.getIvaRate() != null) p.setIvaRate(in.getIvaRate());
        if (in.getActive() != null) p.setActive(in.getActive());
    }

    private KioskProduct saveCheckingBarcode(KioskProduct product) {
        try {
            return productRepository.saveAndFlush(product);
        } catch (DataIntegrityViolationException e) {
            // Choca el índice único parcial ux_kiosk_product_barcode → barcode duplicado.
            throw new ResponseStatusException(HttpStatus.CONFLICT, BARCODE_TAKEN);
        }
    }
}
