package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskDashboardDTO;
import com.veltronik.v2.kiosk.dto.KioskReportDTO;
import com.veltronik.v2.kiosk.entities.*;
import com.veltronik.v2.kiosk.repositories.KioskCustomerRepository;
import com.veltronik.v2.kiosk.repositories.KioskProductRepository;
import com.veltronik.v2.kiosk.repositories.KioskSaleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

/**
 * Tests de la analítica del kiosco: rentabilidad (ventas − costo), ranking de productos por
 * ingreso, desglose por medio de pago, y el conteo de renglones sin costo cargado (margen
 * aproximado). Mockea las ventas del período; agrega en memoria igual que en producción.
 */
@ExtendWith(MockitoExtension.class)
class KioskAnalyticsServiceTest {

    @Mock private KioskSaleRepository saleRepository;
    @Mock private KioskCustomerRepository customerRepository;
    @Mock private KioskProductRepository productRepository;

    @InjectMocks private KioskAnalyticsService service;

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

    private KioskProduct product(String name, String cost) {
        KioskProduct p = new KioskProduct();
        p.setId(UUID.randomUUID());
        p.setTenant(tenant);
        p.setName(name);
        p.setSalePrice(new BigDecimal("100"));
        p.setCostPrice(cost == null ? null : new BigDecimal(cost));
        return p;
    }

    private KioskSaleItem item(KioskProduct p, String qty, String lineTotal) {
        KioskSaleItem it = new KioskSaleItem();
        it.setTenant(tenant);
        it.setProduct(p);
        it.setProductNameSnapshot(p.getName());
        it.setUnitPriceSnapshot(p.getSalePrice());
        it.setQuantity(new BigDecimal(qty));
        it.setLineTotal(new BigDecimal(lineTotal));
        return it;
    }

    private KioskSale sale(String total, List<KioskSaleItem> items, KioskPaymentMethod method) {
        KioskSale s = new KioskSale();
        s.setId(UUID.randomUUID());
        s.setTenant(tenant);
        s.setStatus(KioskSaleStatus.COMPLETED);
        s.setTotal(new BigDecimal(total));
        s.setCreatedAt(LocalDateTime.now());
        for (KioskSaleItem it : items) { it.setSale(s); s.getItems().add(it); }
        KioskSalePayment pay = new KioskSalePayment();
        pay.setTenant(tenant);
        pay.setSale(s);
        pay.setMethod(method);
        pay.setAmount(new BigDecimal(total));
        s.getPayments().add(pay);
        return s;
    }

    /** Venta tipo: producto A (costo 60) x2 + producto B (sin costo) x1, total 250, en efectivo. */
    private List<KioskSale> typicalSales(KioskProduct a, KioskProduct b) {
        List<KioskSaleItem> items = new ArrayList<>();
        items.add(item(a, "2", "200"));
        items.add(item(b, "1", "50"));
        return List.of(sale("250", items, KioskPaymentMethod.CASH));
    }

    @Test
    @DisplayName("dashboard calcula ventas, costo, ganancia y margen; el costo ignora renglones sin costo cargado")
    void dashboardComputesProfitability() {
        KioskProduct a = product("Coca 500ml", "60");
        KioskProduct b = product("Caramelo suelto", null);
        when(saleRepository.findByStatusInPeriod(eq(tenantId), eq(KioskSaleStatus.COMPLETED), any(), any()))
                .thenReturn(typicalSales(a, b));
        when(customerRepository.findWithDebt(tenantId)).thenReturn(List.of());
        when(productRepository.findLowStock(tenantId)).thenReturn(List.of());

        KioskDashboardDTO d = service.dashboard();

        assertEquals(0, d.getMonthRevenue().compareTo(new BigDecimal("250")));
        assertEquals(0, d.getMonthCogs().compareTo(new BigDecimal("120")));       // solo A: 60*2
        assertEquals(0, d.getMonthGrossProfit().compareTo(new BigDecimal("130"))); // 250 - 120
        assertEquals(52, d.getMonthMarginPct());                                   // 130/250
        assertEquals(1, d.getMonthSalesCount());
        assertEquals(0, d.getAvgTicket().compareTo(new BigDecimal("250")));
        assertEquals(0, d.getCollectedCash().compareTo(new BigDecimal("250")));
    }

    @Test
    @DisplayName("dashboard rankea los productos por ingreso (mayor primero)")
    void dashboardRanksTopProducts() {
        KioskProduct a = product("Coca 500ml", "60");
        KioskProduct b = product("Caramelo suelto", null);
        when(saleRepository.findByStatusInPeriod(eq(tenantId), eq(KioskSaleStatus.COMPLETED), any(), any()))
                .thenReturn(typicalSales(a, b));
        when(customerRepository.findWithDebt(tenantId)).thenReturn(List.of());
        when(productRepository.findLowStock(tenantId)).thenReturn(List.of());

        KioskDashboardDTO d = service.dashboard();

        assertEquals(2, d.getTopProducts().size());
        assertEquals("Coca 500ml", d.getTopProducts().get(0).name());        // 200 > 50
        assertEquals(0, d.getTopProducts().get(0).revenue().compareTo(new BigDecimal("200")));
        assertEquals(0, d.getTopProducts().get(0).profit().compareTo(new BigDecimal("80")));   // 200 - 120
        assertEquals("Caramelo suelto", d.getTopProducts().get(1).name());
    }

    @Test
    @DisplayName("dashboard sin ventas: KPIs en cero, ticket promedio cero y un insight de bienvenida")
    void dashboardWithNoSales() {
        when(saleRepository.findByStatusInPeriod(eq(tenantId), eq(KioskSaleStatus.COMPLETED), any(), any()))
                .thenReturn(List.of());
        when(customerRepository.findWithDebt(tenantId)).thenReturn(List.of());
        when(productRepository.findLowStock(tenantId)).thenReturn(List.of());

        KioskDashboardDTO d = service.dashboard();

        assertEquals(0, d.getMonthSalesCount());
        assertEquals(0, d.getMonthRevenue().compareTo(BigDecimal.ZERO));
        assertEquals(0, d.getAvgTicket().compareTo(BigDecimal.ZERO));
        assertEquals(0, d.getMonthMarginPct());
        assertEquals(1, d.getInsights().size());
        assertEquals("info", d.getInsights().get(0).type());
    }

    @Test
    @DisplayName("report arma rentabilidad por producto, totales por medio de pago y cuenta renglones sin costo")
    void reportBuildsProductProfitabilityAndTotals() {
        KioskProduct a = product("Coca 500ml", "60");
        KioskProduct b = product("Caramelo suelto", null);
        when(saleRepository.findByStatusInPeriod(eq(tenantId), eq(KioskSaleStatus.COMPLETED), any(), any()))
                .thenReturn(typicalSales(a, b));

        KioskReportDTO r = service.report(LocalDate.now().withDayOfMonth(1), LocalDate.now());

        assertEquals(1, r.getSalesCount());
        assertEquals(0, r.getTotalRevenue().compareTo(new BigDecimal("250")));
        assertEquals(0, r.getTotalCogs().compareTo(new BigDecimal("120")));
        assertEquals(0, r.getGrossProfit().compareTo(new BigDecimal("130")));
        assertEquals(0, r.getTotalCash().compareTo(new BigDecimal("250")));
        assertEquals(1, r.getItemsWithoutCost());                 // el caramelo sin costo

        assertEquals(2, r.getProducts().size());
        KioskReportDTO.ProductRow coca = r.getProducts().get(0);  // mayor ingreso primero
        assertEquals("Coca 500ml", coca.name());
        assertEquals(0, coca.profit().compareTo(new BigDecimal("80")));
        assertEquals(40, coca.marginPct());                       // 80/200

        assertEquals(1, r.getSales().size());
        assertEquals(2, r.getSales().get(0).items());
        assertEquals("Efectivo", r.getSales().get(0).methods());
    }
}
