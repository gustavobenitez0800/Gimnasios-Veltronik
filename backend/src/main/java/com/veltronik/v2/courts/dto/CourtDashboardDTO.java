package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Tablero del dueño/admin del complejo. Métricas pensadas para canchas: la ocupación es
 * la reina (cancha vacía = plata perdida) y el no-show es el enemigo. Incluye la capa
 * Veltronik AI (predicción + insights accionables).
 */
@Data
public class CourtDashboardDTO {
    private String period;                 // "YYYY-MM"

    // KPIs
    private BigDecimal monthRevenue;
    private BigDecimal todayRevenue;
    private int occupancyPct;              // promedio del mes
    private int completedCount;            // turnos jugados este mes
    private int noShowCount;
    private int noShowRatePct;
    private int activeRecurringCount;      // turnos fijos activos
    private int recurringRevenuePct;       // % de la facturación que viene de turnos fijos
    private int pendingDepositCount;
    private BigDecimal pendingDepositAmount;

    // Gráficos
    private List<DayPoint> revenueByDay;   // últimos 14 días
    private List<HeatCell> heatmap;        // últimos 28 días, ocupación por (día, hora)
    private BigDecimal collectedCash;
    private BigDecimal collectedTransfer;
    private BigDecimal collectedMp;
    private List<CourtStat> byCourt;

    // Veltronik AI
    private Prediction prediction;
    private List<Insight> insights;
    private List<CustomerStat> topCustomers;

    // Bot (0 si no se usa)
    private long botConversations;
    private long botHandoffs;

    public record DayPoint(String date, BigDecimal amount) {}
    public record HeatCell(int dayOfWeek, int hour, int occupancyPct) {}
    public record CourtStat(String court, int occupancyPct, BigDecimal revenue) {}
    public record Prediction(BigDecimal predicted, int confidence, String trend, double percentChange) {}
    public record Insight(String type, String title, String message) {}
    public record CustomerStat(String name, String phone, BigDecimal spent, int visits) {}
}
