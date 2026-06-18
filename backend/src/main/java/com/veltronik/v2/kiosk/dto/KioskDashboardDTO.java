package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Tablero del dueño/admin del kiosco. Métricas pensadas para retail: la <b>rentabilidad</b> es
 * la reina (vender mucho con margen flaco no deja plata), el producto estrella manda la góndola
 * y la hora pico define el turno del empleado. Incluye fiado, stock bajo y la capa Veltronik AI
 * (insights accionables). Todo del mes en curso salvo {@code revenueByDay} (últimos 14 días).
 */
@Data
public class KioskDashboardDTO {
    private String period;                 // "YYYY-MM"

    // ── KPIs del mes ──
    private BigDecimal monthRevenue;       // ventas (total cobrado, todos los medios)
    private BigDecimal todayRevenue;
    private BigDecimal monthCogs;          // costo de la mercadería vendida (de los costos cargados)
    private BigDecimal monthGrossProfit;   // ganancia bruta = ventas - costo
    private int monthMarginPct;            // margen % sobre las ventas
    private int monthSalesCount;
    private int todaySalesCount;
    private BigDecimal avgTicket;          // ticket promedio del mes

    // ── Gráficos ──
    private List<DayPoint> revenueByDay;   // últimos 14 días
    private List<HourPoint> salesByHour;   // 0..23, ventas del mes (para ver la hora pico)

    // ── Cómo te pagan (mes) ──
    private BigDecimal collectedCash;
    private BigDecimal collectedCard;
    private BigDecimal collectedTransfer;
    private BigDecimal collectedMp;
    private BigDecimal collectedCuentaCorriente;   // fiado (queda como deuda, no es caja)

    // ── Rankings ──
    private List<ProductStat> topProducts; // por ingreso del mes
    private List<DebtorStat> topDebtors;   // mayores deudores de fiado

    // ── Fiado / stock ──
    private BigDecimal debtTotal;          // Σ saldo de los clientes
    private int debtorCount;
    private int lowStockCount;             // productos en/bajo el mínimo

    // ── Veltronik AI ──
    private List<Insight> insights;

    public record DayPoint(String date, BigDecimal amount) {}
    public record HourPoint(int hour, BigDecimal amount, int count) {}
    public record ProductStat(String name, String category, BigDecimal units, BigDecimal revenue, BigDecimal profit) {}
    public record DebtorStat(String name, String phone, BigDecimal balance) {}
    public record Insight(String type, String title, String message) {}
}
