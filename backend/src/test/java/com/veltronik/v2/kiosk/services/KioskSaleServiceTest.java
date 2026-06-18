package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskSaleInputDTO;
import com.veltronik.v2.kiosk.dto.KioskSaleItemInputDTO;
import com.veltronik.v2.kiosk.dto.KioskSalePaymentInputDTO;
import com.veltronik.v2.kiosk.entities.*;
import com.veltronik.v2.kiosk.repositories.KioskSaleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests del motor de ventas: idempotencia, descuento de stock por el libro mayor, autoridad de
 * precios del backend, validación de pagos y devolución de stock en la anulación.
 */
@ExtendWith(MockitoExtension.class)
class KioskSaleServiceTest {

    @Mock private KioskSaleRepository saleRepository;
    @Mock private KioskProductService productService;
    @Mock private KioskStockService stockService;
    @Mock private KioskCashService cashService;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks private KioskSaleService service;

    private final UUID tenantId = UUID.randomUUID();
    private Tenant tenant;
    private KioskCashSession session;

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(tenantId);
        tenant = new Tenant();
        tenant.setId(tenantId);
        session = new KioskCashSession();
        session.setId(UUID.randomUUID());
        session.setTenant(tenant);
        session.setStatus(KioskCashSessionStatus.OPEN);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private KioskProduct product(BigDecimal price, boolean isService) {
        KioskProduct p = new KioskProduct();
        p.setId(UUID.randomUUID());
        p.setTenant(tenant);
        p.setName("Coca 500ml");
        p.setSalePrice(price);
        p.setIvaRate(new BigDecimal("21.00"));
        p.setService(isService);
        return p;
    }

    private KioskSaleInputDTO input(UUID clientUuid, UUID productId, String qty,
                                    String method, String amount) {
        KioskSaleItemInputDTO item = new KioskSaleItemInputDTO();
        item.setProductId(productId);
        item.setQuantity(new BigDecimal(qty));
        KioskSalePaymentInputDTO pay = new KioskSalePaymentInputDTO();
        pay.setMethod(method);
        pay.setAmount(new BigDecimal(amount));
        KioskSaleInputDTO in = new KioskSaleInputDTO();
        in.setClientUuid(clientUuid);
        in.setItems(List.of(item));
        in.setPayments(List.of(pay));
        return in;
    }

    @Test
    @DisplayName("register es idempotente: si la venta (clientUuid) ya existe, la devuelve sin tocar stock ni caja")
    void registerIsIdempotent() {
        UUID clientUuid = UUID.randomUUID();
        KioskSale existing = new KioskSale();
        existing.setTenant(tenant);
        when(saleRepository.findByTenantIdAndClientUuid(tenantId, clientUuid)).thenReturn(Optional.of(existing));

        KioskSale result = service.register(input(clientUuid, UUID.randomUUID(), "1", "CASH", "100"));

        assertSame(existing, result);
        verify(cashService, never()).requireOpenSession();
        verify(saleRepository, never()).saveAndFlush(any());
        verify(stockService, never()).applyMovement(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("register descuenta stock con un movimiento SALE por la cantidad negada y toma el precio del producto")
    void registerDecrementsStockAndUsesBackendPrice() {
        UUID clientUuid = UUID.randomUUID();
        KioskProduct p = product(new BigDecimal("100.00"), false);
        when(saleRepository.findByTenantIdAndClientUuid(tenantId, clientUuid)).thenReturn(Optional.empty());
        when(cashService.requireOpenSession()).thenReturn(session);
        when(productService.findByIdAndVerifyOwnership(p.getId())).thenReturn(p);
        when(saleRepository.saveAndFlush(any(KioskSale.class))).thenAnswer(inv -> inv.getArgument(0));

        // 2 unidades a $100 = $200; el cliente paga $200 en efectivo.
        KioskSale sale = service.register(input(clientUuid, p.getId(), "2", "CASH", "200.00"));

        assertEquals(0, sale.getTotal().compareTo(new BigDecimal("200.00")));
        assertEquals(KioskSaleStatus.COMPLETED, sale.getStatus());
        assertEquals(1, sale.getItems().size());
        assertEquals(0, sale.getItems().get(0).getLineTotal().compareTo(new BigDecimal("200.00")));
        verify(stockService).applyMovement(eq(p), eq(KioskStockMovementType.SALE),
                argThat(q -> q.compareTo(new BigDecimal("-2")) == 0), eq("Venta"), any());
    }

    @Test
    @DisplayName("register NO descuenta stock para productos de servicio (recarga/SUBE)")
    void registerSkipsStockForServiceProducts() {
        UUID clientUuid = UUID.randomUUID();
        KioskProduct recarga = product(new BigDecimal("500.00"), true);
        when(saleRepository.findByTenantIdAndClientUuid(tenantId, clientUuid)).thenReturn(Optional.empty());
        when(cashService.requireOpenSession()).thenReturn(session);
        when(productService.findByIdAndVerifyOwnership(recarga.getId())).thenReturn(recarga);
        when(saleRepository.saveAndFlush(any(KioskSale.class))).thenAnswer(inv -> inv.getArgument(0));

        service.register(input(clientUuid, recarga.getId(), "1", "CASH", "500.00"));

        verify(stockService, never()).applyMovement(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("register rechaza (400) si los pagos no cubren exactamente el total")
    void registerRejectsPaymentMismatch() {
        UUID clientUuid = UUID.randomUUID();
        KioskProduct p = product(new BigDecimal("100.00"), false);
        when(saleRepository.findByTenantIdAndClientUuid(tenantId, clientUuid)).thenReturn(Optional.empty());
        when(cashService.requireOpenSession()).thenReturn(session);
        when(productService.findByIdAndVerifyOwnership(p.getId())).thenReturn(p);

        // total = $200 pero paga $150.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.register(input(clientUuid, p.getId(), "2", "CASH", "150.00")));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(saleRepository, never()).saveAndFlush(any());
        verify(stockService, never()).applyMovement(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("voidSale devuelve el stock con un movimiento RETURN y marca la venta VOIDED")
    void voidSaleReturnsStock() {
        KioskProduct p = product(new BigDecimal("100.00"), false);
        KioskSale sale = new KioskSale();
        sale.setId(UUID.randomUUID());
        sale.setTenant(tenant);
        sale.setStatus(KioskSaleStatus.COMPLETED);
        KioskSaleItem item = new KioskSaleItem();
        item.setProduct(p);
        item.setQuantity(new BigDecimal("3"));
        sale.getItems().add(item);
        when(saleRepository.findById(sale.getId())).thenReturn(Optional.of(sale));
        when(saleRepository.save(any(KioskSale.class))).thenAnswer(inv -> inv.getArgument(0));

        KioskSale result = service.voidSale(sale.getId());

        assertEquals(KioskSaleStatus.VOIDED, result.getStatus());
        verify(stockService).applyMovement(eq(p), eq(KioskStockMovementType.RETURN),
                argThat(q -> q.compareTo(new BigDecimal("3")) == 0), eq("Anulación de venta"), eq(sale.getId()));
    }

    @Test
    @DisplayName("voidSale rechaza (409) anular una venta ya anulada")
    void voidSaleRejectsDoubleVoid() {
        KioskSale sale = new KioskSale();
        sale.setId(UUID.randomUUID());
        sale.setTenant(tenant);
        sale.setStatus(KioskSaleStatus.VOIDED);
        when(saleRepository.findById(sale.getId())).thenReturn(Optional.of(sale));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.voidSale(sale.getId()));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(saleRepository, never()).save(any());
        verify(stockService, never()).applyMovement(any(), any(), any(), any(), any());
    }
}
