package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskSaleInputDTO;
import com.veltronik.v2.kiosk.dto.KioskSaleItemInputDTO;
import com.veltronik.v2.kiosk.dto.KioskSalePaymentInputDTO;
import com.veltronik.v2.kiosk.entities.*;
import com.veltronik.v2.kiosk.repositories.KioskSaleRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Motor de ventas del kiosco.
 *
 * <p><b>Venta atómica e idempotente:</b> en una sola transacción se arman los renglones (con
 * snapshot de precio/IVA), se descuenta el stock por el libro mayor y se registran los pagos.
 * La llave {@code clientUuid} (generada por el cliente) hace que reenviar la misma venta —el caso
 * típico de la cola offline— devuelva la venta existente en vez de duplicarla. La carrera la
 * decide el índice único parcial {@code ux_kiosk_sale_client_uuid}.</p>
 *
 * <p><b>El backend es la autoridad de los precios</b> (Mandamiento #4): los importes salen de los
 * productos, nunca del cliente. El cliente solo dice qué producto, cuánta cantidad y cómo pagó.</p>
 */
@Service
public class KioskSaleService {

    private final KioskSaleRepository saleRepository;
    private final KioskProductService productService;
    private final KioskStockService stockService;
    private final KioskCashService cashService;

    public KioskSaleService(KioskSaleRepository saleRepository,
                            KioskProductService productService,
                            KioskStockService stockService,
                            KioskCashService cashService) {
        this.saleRepository = saleRepository;
        this.productService = productService;
        this.stockService = stockService;
        this.cashService = cashService;
    }

    public KioskSale findByIdAndVerifyOwnership(UUID id) {
        KioskSale sale = saleRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Venta no encontrada"));
        if (!sale.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a esta venta");
        }
        return sale;
    }

    /**
     * Detalle de una venta para mostrar (con renglones y pagos inicializados).
     *
     * <p>La app corre con {@code open-in-view=false}: las colecciones del agregado se inicializan
     * acá, dentro de la transacción, para que el mapper las lea en el controller. No se puede
     * JOIN FETCH de los dos {@code bag} (items y payments) a la vez (MultipleBagFetchException),
     * por eso se tocan ({@code size()}) y {@code @BatchSize} hace que carguen en pocos queries.</p>
     */
    @Transactional(readOnly = true)
    public KioskSale findDetailById(UUID id) {
        KioskSale sale = findByIdAndVerifyOwnership(id);
        sale.getItems().size();
        sale.getPayments().size();
        return sale;
    }

    @Transactional(readOnly = true)
    public List<KioskSale> findTodayForCurrentTenant() {
        LocalDate today = LocalDate.now();
        List<KioskSale> sales = saleRepository.findByTenantIdAndCreatedAtBetweenOrderByCreatedAtDesc(
                TenantContextHolder.getTenantId(), today.atStartOfDay(), today.plusDays(1).atStartOfDay());
        for (KioskSale sale : sales) {           // inicializa el agregado dentro de la transacción
            sale.getItems().size();
            sale.getPayments().size();
        }
        return sales;
    }

    /**
     * Registra una venta. Idempotente por {@code clientUuid}: si la venta ya existe, la devuelve
     * tal cual (no duplica stock ni caja).
     */
    @Transactional
    public KioskSale register(KioskSaleInputDTO in) {
        UUID tenantId = TenantContextHolder.getTenantId();

        // 1) Idempotencia: ¿ya se registró esta venta? (replay de la cola offline)
        Optional<KioskSale> existing = saleRepository.findByTenantIdAndClientUuid(tenantId, in.getClientUuid());
        if (existing.isPresent()) {
            return existing.get();
        }

        // 2) Tiene que haber una caja abierta.
        KioskCashSession session = cashService.requireOpenSession();

        // 3) Armar el agregado con snapshots y precios autoritativos del backend.
        KioskSale sale = new KioskSale();
        Tenant tenant = new Tenant();
        tenant.setId(tenantId);
        sale.setTenant(tenant);
        sale.setCashSession(session);
        sale.setClientUuid(in.getClientUuid());
        sale.setStatus(KioskSaleStatus.COMPLETED);
        sale.setSoldBy(SecurityUtils.getCurrentUserId());
        sale.setNotes(in.getNotes());

        BigDecimal subtotal = BigDecimal.ZERO;
        for (KioskSaleItemInputDTO itemIn : in.getItems()) {
            KioskProduct product = productService.findByIdAndVerifyOwnership(itemIn.getProductId());
            BigDecimal qty = itemIn.getQuantity();
            BigDecimal lineTotal = product.getSalePrice().multiply(qty).setScale(2, RoundingMode.HALF_UP);

            KioskSaleItem item = new KioskSaleItem();
            item.setProduct(product);
            item.setProductNameSnapshot(product.getName());
            item.setUnitPriceSnapshot(product.getSalePrice());
            item.setIvaRateSnapshot(product.getIvaRate());
            item.setQuantity(qty);
            item.setLineTotal(lineTotal);
            sale.addItem(item);

            subtotal = subtotal.add(lineTotal);
        }

        BigDecimal surcharge = BigDecimal.ZERO; // recargo tarjeta → Fase 2
        BigDecimal total = subtotal.add(surcharge).setScale(2, RoundingMode.HALF_UP);
        sale.setSubtotal(subtotal.setScale(2, RoundingMode.HALF_UP));
        sale.setSurcharge(surcharge);
        sale.setTotal(total);

        // 4) Pagos. El backend valida que cubran exactamente el total (el vuelto es del front).
        BigDecimal paid = BigDecimal.ZERO;
        for (KioskSalePaymentInputDTO payIn : in.getPayments()) {
            KioskSalePayment payment = new KioskSalePayment();
            payment.setMethod(parseMethod(payIn.getMethod()));
            payment.setAmount(payIn.getAmount());
            sale.addPayment(payment);
            paid = paid.add(payIn.getAmount());
        }
        if (paid.compareTo(total) != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Los pagos (" + paid + ") no coinciden con el total de la venta (" + total + ")");
        }

        // 5) Persistir el agregado. La carrera de idempotencia la decide el índice único.
        KioskSale saved;
        try {
            saved = saleRepository.saveAndFlush(sale);
        } catch (DataIntegrityViolationException e) {
            // Otro request guardó la misma venta primero → devolvemos esa (idempotencia).
            return saleRepository.findByTenantIdAndClientUuid(tenantId, in.getClientUuid())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Venta duplicada"));
        }

        // 6) Mover el stock por el libro mayor (los servicios no descuentan stock).
        for (KioskSaleItem item : saved.getItems()) {
            KioskProduct product = item.getProduct();
            if (product != null && !product.isService()) {
                stockService.applyMovement(product, KioskStockMovementType.SALE,
                        item.getQuantity().negate(), "Venta", saved.getId());
            }
        }
        return saved;
    }

    /** Anula una venta: la marca VOIDED y devuelve el stock con movimientos RETURN. */
    @Transactional
    public KioskSale voidSale(UUID id) {
        KioskSale sale = findByIdAndVerifyOwnership(id);
        if (sale.getStatus() == KioskSaleStatus.VOIDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La venta ya está anulada");
        }
        sale.setStatus(KioskSaleStatus.VOIDED);
        for (KioskSaleItem item : sale.getItems()) {
            KioskProduct product = item.getProduct();
            if (product != null && !product.isService()) {
                stockService.applyMovement(product, KioskStockMovementType.RETURN,
                        item.getQuantity(), "Anulación de venta", sale.getId());
            }
        }
        sale.getPayments().size(); // inicializa los pagos para el mapeo (open-in-view=false)
        return saleRepository.save(sale);
    }

    private KioskPaymentMethod parseMethod(String raw) {
        try {
            return KioskPaymentMethod.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Medio de pago inválido: " + raw);
        }
    }
}
