package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskDashboardDTO;
import com.veltronik.v2.kiosk.dto.KioskDashboardDTO.*;
import com.veltronik.v2.kiosk.dto.KioskReportDTO;
import com.veltronik.v2.kiosk.dto.KioskReportDTO.ProductRow;
import com.veltronik.v2.kiosk.dto.KioskReportDTO.SaleRow;
import com.veltronik.v2.kiosk.entities.*;
import com.veltronik.v2.kiosk.repositories.KioskCustomerRepository;
import com.veltronik.v2.kiosk.repositories.KioskProductRepository;
import com.veltronik.v2.kiosk.repositories.KioskSaleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Analítica del vertical kiosco (dashboard + reportes). Lecturas agregadas pensadas para el
 * dueño: la <b>rentabilidad</b> (vender con margen, no solo vender), el producto estrella, la
 * hora pico, los medios de pago y el fiado. Mismo enfoque que {@code CourtAnalyticsService}:
 * traer las ventas del período en pocas queries y agregar en memoria.
 *
 * <p>Los métodos son {@code @Transactional(readOnly = true)} a propósito: la app corre con
 * {@code open-in-view=false} y acá se recorren las dos colecciones del agregado (renglones y
 * pagos) LAZY — Hibernate las carga en lotes ({@code @BatchSize}) dentro de esta transacción.</p>
 *
 * <p><b>Costo/margen:</b> los renglones de venta NO guardan snapshot de costo, así que el costo
 * se toma del costo de reposición actual del producto ({@code costPrice}). Es la convención
 * estándar de un kiosco; los renglones sin costo cargado (o de productos borrados) no entran al
 * costo y se cuentan aparte para avisarle al dueño.</p>
 */
@Service
public class KioskAnalyticsService {

    private static final String[] DAY_NAMES = {"", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};

    private final KioskSaleRepository saleRepository;
    private final KioskCustomerRepository customerRepository;
    private final KioskProductRepository productRepository;

    public KioskAnalyticsService(KioskSaleRepository saleRepository,
                                 KioskCustomerRepository customerRepository,
                                 KioskProductRepository productRepository) {
        this.saleRepository = saleRepository;
        this.customerRepository = customerRepository;
        this.productRepository = productRepository;
    }

    // ───────────────────────────────── DASHBOARD ─────────────────────────────────

    @Transactional(readOnly = true)
    public KioskDashboardDTO dashboard() {
        UUID tenant = TenantContextHolder.getTenantId();
        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        // La ventana cubre lo más temprano entre el inicio del mes y 14 días atrás (para el gráfico).
        LocalDate windowStart = monthStart.isBefore(today.minusDays(13)) ? monthStart : today.minusDays(13);
        LocalDateTime from = windowStart.atStartOfDay();
        LocalDateTime to = today.plusDays(1).atStartOfDay();

        List<KioskSale> sales = saleRepository.findByStatusInPeriod(tenant, KioskSaleStatus.COMPLETED, from, to);

        KioskDashboardDTO dto = new KioskDashboardDTO();
        dto.setPeriod(monthStart.toString().substring(0, 7));

        BigDecimal monthRevenue = BigDecimal.ZERO, monthCogs = BigDecimal.ZERO, today$ = BigDecimal.ZERO;
        BigDecimal cash = BigDecimal.ZERO, card = BigDecimal.ZERO, transfer = BigDecimal.ZERO,
                mp = BigDecimal.ZERO, cc = BigDecimal.ZERO;
        int monthSalesCount = 0, todaySalesCount = 0, linesWithoutCost = 0;
        Map<LocalDate, BigDecimal> byDate = new HashMap<>();
        BigDecimal[] hourRev = newMoneyArray(24);
        int[] hourCnt = new int[24];
        Map<String, ProductAcc> products = new HashMap<>();

        for (KioskSale s : sales) {
            LocalDate d = s.getCreatedAt().toLocalDate();
            byDate.merge(d, s.getTotal(), BigDecimal::add);   // el gráfico abarca toda la ventana
            if (d.isBefore(monthStart)) continue;             // el resto de los KPIs son del mes

            monthSalesCount++;
            monthRevenue = monthRevenue.add(s.getTotal());
            int h = s.getCreatedAt().getHour();
            hourRev[h] = hourRev[h].add(s.getTotal());
            hourCnt[h]++;
            if (d.isEqual(today)) {
                today$ = today$.add(s.getTotal());
                todaySalesCount++;
            }

            for (KioskSalePayment p : s.getPayments()) {
                switch (p.getMethod()) {
                    case CASH -> cash = cash.add(p.getAmount());
                    case CARD -> card = card.add(p.getAmount());
                    case TRANSFER -> transfer = transfer.add(p.getAmount());
                    case MP -> mp = mp.add(p.getAmount());
                    case CUENTA_CORRIENTE -> cc = cc.add(p.getAmount());
                }
            }

            for (KioskSaleItem it : s.getItems()) {
                BigDecimal lineCost = lineCost(it);
                if (lineCost != null) monthCogs = monthCogs.add(lineCost);
                else linesWithoutCost++;
                ProductAcc acc = products.computeIfAbsent(productKey(it),
                        k -> new ProductAcc(it.getProductNameSnapshot(), categoryName(it)));
                acc.add(it.getQuantity(), it.getLineTotal(), lineCost);
            }
        }

        BigDecimal grossProfit = monthRevenue.subtract(monthCogs);
        dto.setMonthRevenue(monthRevenue);
        dto.setTodayRevenue(today$);
        dto.setMonthCogs(monthCogs);
        dto.setMonthGrossProfit(grossProfit);
        dto.setMonthMarginPct(pct(grossProfit, monthRevenue));
        dto.setMonthSalesCount(monthSalesCount);
        dto.setTodaySalesCount(todaySalesCount);
        dto.setAvgTicket(monthSalesCount > 0
                ? monthRevenue.divide(BigDecimal.valueOf(monthSalesCount), 0, RoundingMode.HALF_UP)
                : BigDecimal.ZERO);

        dto.setCollectedCash(cash);
        dto.setCollectedCard(card);
        dto.setCollectedTransfer(transfer);
        dto.setCollectedMp(mp);
        dto.setCollectedCuentaCorriente(cc);

        // ── ingresos por día (últimos 14) ──
        List<DayPoint> revenueByDay = new ArrayList<>();
        for (int i = 13; i >= 0; i--) {
            LocalDate dd = today.minusDays(i);
            revenueByDay.add(new DayPoint(dd.toString(), byDate.getOrDefault(dd, BigDecimal.ZERO)));
        }
        dto.setRevenueByDay(revenueByDay);

        // ── ventas por hora (mes) ──
        List<HourPoint> byHour = new ArrayList<>();
        for (int h = 0; h < 24; h++) byHour.add(new HourPoint(h, hourRev[h], hourCnt[h]));
        dto.setSalesByHour(byHour);

        // ── top productos (por ingreso) ──
        dto.setTopProducts(products.values().stream()
                .sorted(Comparator.comparing((ProductAcc a) -> a.revenue).reversed())
                .limit(8)
                .map(a -> new ProductStat(a.name, a.category, a.units, a.revenue, a.profit))
                .toList());

        // ── fiado ──
        List<KioskCustomer> debtors = customerRepository.findWithDebt(tenant);
        BigDecimal debtTotal = BigDecimal.ZERO;
        for (KioskCustomer c : debtors) debtTotal = debtTotal.add(c.getBalance());
        dto.setDebtTotal(debtTotal);
        dto.setDebtorCount(debtors.size());
        dto.setTopDebtors(debtors.stream()
                .limit(5)
                .map(c -> new DebtorStat(c.getFullName(), c.getPhone(), c.getBalance()))
                .toList());

        // ── stock bajo ──
        int lowStock = productRepository.findLowStock(tenant).size();
        dto.setLowStockCount(lowStock);

        // ── insights ──
        dto.setInsights(insights(dto, linesWithoutCost));
        return dto;
    }

    // ───────────────────────────────── REPORTE ─────────────────────────────────

    @Transactional(readOnly = true)
    public KioskReportDTO report(LocalDate fromDate, LocalDate toDate) {
        UUID tenant = TenantContextHolder.getTenantId();
        LocalDateTime from = fromDate.atStartOfDay();
        LocalDateTime to = toDate.plusDays(1).atStartOfDay();
        List<KioskSale> sales = saleRepository.findByStatusInPeriod(tenant, KioskSaleStatus.COMPLETED, from, to);

        KioskReportDTO dto = new KioskReportDTO();
        dto.setFrom(fromDate.toString());
        dto.setTo(toDate.toString());

        BigDecimal revenue = BigDecimal.ZERO, cogs = BigDecimal.ZERO;
        BigDecimal cash = BigDecimal.ZERO, card = BigDecimal.ZERO, transfer = BigDecimal.ZERO,
                mp = BigDecimal.ZERO, cc = BigDecimal.ZERO;
        int linesWithoutCost = 0;
        Map<String, ProductAcc> products = new HashMap<>();
        List<SaleRow> saleRows = new ArrayList<>();

        for (KioskSale s : sales) {
            revenue = revenue.add(s.getTotal());
            for (KioskSalePayment p : s.getPayments()) {
                switch (p.getMethod()) {
                    case CASH -> cash = cash.add(p.getAmount());
                    case CARD -> card = card.add(p.getAmount());
                    case TRANSFER -> transfer = transfer.add(p.getAmount());
                    case MP -> mp = mp.add(p.getAmount());
                    case CUENTA_CORRIENTE -> cc = cc.add(p.getAmount());
                }
            }
            for (KioskSaleItem it : s.getItems()) {
                BigDecimal lineCost = lineCost(it);
                if (lineCost != null) cogs = cogs.add(lineCost);
                else linesWithoutCost++;
                products.computeIfAbsent(productKey(it),
                                k -> new ProductAcc(it.getProductNameSnapshot(), categoryName(it)))
                        .add(it.getQuantity(), it.getLineTotal(), lineCost);
            }
            saleRows.add(new SaleRow(
                    s.getCreatedAt().toLocalDate().toString(),
                    String.format("%02d:%02d", s.getCreatedAt().getHour(), s.getCreatedAt().getMinute()),
                    s.getItems().size(), s.getTotal(),
                    methodsLabel(s.getPayments()),
                    s.getCustomer() != null ? s.getCustomer().getFullName() : "—"));
        }
        saleRows.sort(Comparator.comparing(SaleRow::date).thenComparing(SaleRow::time).reversed());

        BigDecimal profit = revenue.subtract(cogs);
        dto.setSalesCount(sales.size());
        dto.setTotalRevenue(revenue);
        dto.setTotalCogs(cogs);
        dto.setGrossProfit(profit);
        dto.setMarginPct(pct(profit, revenue));
        dto.setTotalCash(cash);
        dto.setTotalCard(card);
        dto.setTotalTransfer(transfer);
        dto.setTotalMp(mp);
        dto.setTotalCuentaCorriente(cc);
        dto.setItemsWithoutCost(linesWithoutCost);

        dto.setProducts(products.values().stream()
                .sorted(Comparator.comparing((ProductAcc a) -> a.revenue).reversed())
                .map(a -> new ProductRow(a.name, a.category, a.units, a.revenue, a.cost, a.profit,
                        pct(a.profit, a.revenue)))
                .toList());
        dto.setSales(saleRows);
        return dto;
    }

    // ───────────────────────────────── helpers ─────────────────────────────────

    /** Acumulador por producto (unidades, ingreso, costo conocido y ganancia). */
    private static final class ProductAcc {
        final String name;
        final String category;
        BigDecimal units = BigDecimal.ZERO;
        BigDecimal revenue = BigDecimal.ZERO;
        BigDecimal cost = BigDecimal.ZERO;
        BigDecimal profit = BigDecimal.ZERO;

        ProductAcc(String name, String category) {
            this.name = name;
            this.category = category;
        }

        void add(BigDecimal qty, BigDecimal lineTotal, BigDecimal lineCost) {
            units = units.add(qty);
            revenue = revenue.add(lineTotal);
            if (lineCost != null) {
                cost = cost.add(lineCost);
                profit = profit.add(lineTotal.subtract(lineCost));
            }
        }
    }

    /** Costo del renglón = costo de reposición actual × cantidad. null si no se puede saber. */
    private static BigDecimal lineCost(KioskSaleItem it) {
        KioskProduct p = it.getProduct();
        if (p == null || p.getCostPrice() == null) return null;
        return p.getCostPrice().multiply(it.getQuantity());
    }

    /** Clave de agrupación: id del producto si vive, o su nombre snapshot si se borró. */
    private static String productKey(KioskSaleItem it) {
        return it.getProduct() != null ? it.getProduct().getId().toString() : "snap:" + it.getProductNameSnapshot();
    }

    private static String categoryName(KioskSaleItem it) {
        if (it.getProduct() != null && it.getProduct().getCategory() != null) {
            return it.getProduct().getCategory().getName();
        }
        return "—";
    }

    private List<Insight> insights(KioskDashboardDTO d, int linesWithoutCost) {
        List<Insight> out = new ArrayList<>();

        if (d.getMonthSalesCount() == 0) {
            out.add(new Insight("info", "Todavía sin ventas",
                    "Cuando empieces a vender este mes vas a ver acá tu ganancia, tus productos estrella y tu hora pico."));
            return out;
        }

        // Margen flaco (solo si hay costos cargados).
        if (d.getMonthCogs().signum() > 0 && d.getMonthMarginPct() < 20) {
            out.add(new Insight("warning", "Margen ajustado",
                    "Tu margen del mes es " + d.getMonthMarginPct() + "%. Revisá precios de venta o costos de compra para no trabajar a pérdida."));
        }
        // Faltan costos → la ganancia no es real.
        if (linesWithoutCost > 0) {
            out.add(new Insight("tip", "Cargá los costos",
                    "Hay ventas de productos sin costo de compra cargado. Cargalo en cada producto para ver tu ganancia real."));
        }
        // Producto estrella.
        if (!d.getTopProducts().isEmpty()) {
            ProductStat top = d.getTopProducts().get(0);
            out.add(new Insight("success", "Producto estrella",
                    top.name() + " es lo que más vendés (" + money(top.revenue()) + " este mes). No te quedes sin stock."));
        }
        // Hora pico.
        HourPoint peak = null;
        for (HourPoint hp : d.getSalesByHour()) if (peak == null || hp.count() > peak.count()) peak = hp;
        if (peak != null && peak.count() > 0) {
            out.add(new Insight("info", "Hora pico",
                    "Tu hora más fuerte es entre las " + peak.hour() + " y las " + (peak.hour() + 1)
                            + "h. Tené la caja y la góndola listas para ese rato."));
        }
        // Fiado.
        if (d.getDebtTotal().signum() > 0) {
            out.add(new Insight("warning", "Fiado por cobrar",
                    "Te deben " + money(d.getDebtTotal()) + " entre " + d.getDebtorCount() + " cliente(s). Cobrá el fiado para no quedarte sin capital."));
        }
        // Stock bajo.
        if (d.getLowStockCount() > 0) {
            out.add(new Insight("tip", "Stock para reponer",
                    "Tenés " + d.getLowStockCount() + " producto(s) en o bajo el mínimo. Armá el pedido al proveedor."));
        }
        return out;
    }

    private static BigDecimal[] newMoneyArray(int n) {
        BigDecimal[] a = new BigDecimal[n];
        Arrays.fill(a, BigDecimal.ZERO);
        return a;
    }

    private static int pct(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0) return 0;
        return (int) Math.round(part.doubleValue() * 100.0 / whole.doubleValue());
    }

    private static String money(BigDecimal v) {
        return "$" + (v == null ? "0" : v.setScale(0, RoundingMode.HALF_UP).toBigInteger().toString());
    }

    private static String methodLabel(KioskPaymentMethod m) {
        if (m == null) return "Efectivo";
        return switch (m) {
            case CASH -> "Efectivo";
            case CARD -> "Tarjeta";
            case TRANSFER -> "Transferencia";
            case MP -> "Mercado Pago";
            case CUENTA_CORRIENTE -> "Fiado";
        };
    }

    /** Etiqueta de los medios de pago de una venta (pago mixto → separados por "+"). */
    private static String methodsLabel(List<KioskSalePayment> payments) {
        if (payments == null || payments.isEmpty()) return "—";
        LinkedHashSet<String> labels = new LinkedHashSet<>();
        for (KioskSalePayment p : payments) labels.add(methodLabel(p.getMethod()));
        return String.join(" + ", labels);
    }
}
