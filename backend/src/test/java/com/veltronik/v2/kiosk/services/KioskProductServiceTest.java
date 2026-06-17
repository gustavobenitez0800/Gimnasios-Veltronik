package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskProductInputDTO;
import com.veltronik.v2.kiosk.entities.KioskProduct;
import com.veltronik.v2.kiosk.entities.KioskStockMovementType;
import com.veltronik.v2.kiosk.repositories.KioskProductRepository;
import com.veltronik.v2.kiosk.repositories.KioskStockMovementRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests de las invariantes de productos: stock inicial como movimiento, barcode único (409),
 * y el borrado protegido por historial (no se pierde el libro mayor).
 */
@ExtendWith(MockitoExtension.class)
class KioskProductServiceTest {

    @Mock private KioskProductRepository productRepository;
    @Mock private KioskStockMovementRepository movementRepository;
    @Mock private KioskCategoryService categoryService;
    @Mock private KioskStockService stockService;

    @InjectMocks private KioskProductService service;

    private final UUID tenantId = UUID.randomUUID();
    private Tenant tenant;

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(tenantId);
        tenant = new Tenant();
        tenant.setId(tenantId);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private KioskProductInputDTO input(String name, BigDecimal salePrice, BigDecimal initialStock) {
        KioskProductInputDTO in = new KioskProductInputDTO();
        in.setName(name);
        in.setSalePrice(salePrice);
        in.setStockQuantity(initialStock);
        return in;
    }

    @Test
    @DisplayName("create con stock inicial > 0 lo registra como movimiento ADJUSTMENT y deja el cache en el valor")
    void createWithInitialStockRecordsMovement() {
        when(productRepository.saveAndFlush(any(KioskProduct.class))).thenAnswer(inv -> inv.getArgument(0));

        KioskProduct created = service.create(input("Coca 500ml", new BigDecimal("1200"), new BigDecimal("24")));

        assertEquals(0, created.getStockQuantity().compareTo(new BigDecimal("24")));
        verify(stockService).applyMovement(eq(created), eq(KioskStockMovementType.ADJUSTMENT),
                argThat(q -> q.compareTo(new BigDecimal("24")) == 0), eq("Stock inicial"), isNull());
    }

    @Test
    @DisplayName("create sin stock inicial NO genera movimiento")
    void createWithoutInitialStockSkipsMovement() {
        when(productRepository.saveAndFlush(any(KioskProduct.class))).thenAnswer(inv -> inv.getArgument(0));

        service.create(input("Marlboro Box", new BigDecimal("3000"), null));

        verify(stockService, never()).applyMovement(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("create con barcode duplicado se traduce a 409")
    void createWithDuplicateBarcodeIsConflict() {
        when(productRepository.saveAndFlush(any(KioskProduct.class)))
                .thenThrow(new DataIntegrityViolationException("ux_kiosk_product_barcode"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(input("Repetido", new BigDecimal("100"), null)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    @DisplayName("delete bloquea (409) si el producto tiene historial de stock (protege el ledger)")
    void deleteBlockedWhenHasHistory() {
        UUID id = UUID.randomUUID();
        KioskProduct product = new KioskProduct();
        product.setId(id);
        product.setTenant(tenant);
        when(productRepository.findById(id)).thenReturn(Optional.of(product));
        when(movementRepository.existsByProductId(id)).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.deleteAndVerifyOwnership(id));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(productRepository, never()).delete(any());
    }

    @Test
    @DisplayName("delete elimina el producto si no tiene historial")
    void deleteWhenNoHistory() {
        UUID id = UUID.randomUUID();
        KioskProduct product = new KioskProduct();
        product.setId(id);
        product.setTenant(tenant);
        when(productRepository.findById(id)).thenReturn(Optional.of(product));
        when(movementRepository.existsByProductId(id)).thenReturn(false);

        service.deleteAndVerifyOwnership(id);

        verify(productRepository).delete(product);
    }
}
