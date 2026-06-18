package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Reporte exportable del kiosco para un rango de fechas: resumen (ventas, costo, ganancia y
 * desglose por medio de pago), rentabilidad por producto y el detalle ticket por ticket. Lo
 * consume {@code KioskReportsPage} para bajar Excel/PDF. Solo dueño/admin.
 *
 * <p><b>Margen aproximado:</b> el costo se toma del costo de reposición actual del producto
 * (los renglones no guardan snapshot de costo). {@code itemsWithoutCost} cuenta los renglones
 * sin costo cargado — esos no entran al costo y por eso el margen puede quedar sobreestimado.</p>
 */
@Data
public class KioskReportDTO {
    private String from;
    private String to;

    // ── Resumen ──
    private int salesCount;
    private BigDecimal totalRevenue;
    private BigDecimal totalCogs;
    private BigDecimal grossProfit;
    private int marginPct;
    private BigDecimal totalCash;
    private BigDecimal totalCard;
    private BigDecimal totalTransfer;
    private BigDecimal totalMp;
    private BigDecimal totalCuentaCorriente;
    private int itemsWithoutCost;

    // ── Detalle ──
    private List<ProductRow> products;     // rentabilidad por producto (mayor ingreso primero)
    private List<SaleRow> sales;           // ticket por ticket (más reciente primero)

    public record ProductRow(String name, String category, BigDecimal units,
                             BigDecimal revenue, BigDecimal cost, BigDecimal profit, int marginPct) {}
    public record SaleRow(String date, String time, int items, BigDecimal total,
                          String methods, String customer) {}
}
