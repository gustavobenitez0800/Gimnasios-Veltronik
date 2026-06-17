package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Datos crudos para los reportes exportables (Excel/PDF) de un rango de fechas.
 * El frontend arma el archivo (mismo patrón que el reporte del gym).
 */
@Data
public class CourtReportDTO {
    private String from;
    private String to;

    // Ingresos: una fila por evento de cobro (seña o saldo) dentro del rango.
    private List<IncomeRow> income;
    private BigDecimal totalCash;
    private BigDecimal totalTransfer;
    private BigDecimal totalMp;
    private BigDecimal total;

    // No-shows del rango.
    private List<NoShowRow> noShows;

    // Resumen.
    private int totalBookings;
    private int completedCount;
    private int noShowCount;
    private int occupancyPct;

    public record IncomeRow(String date, String court, String customer, String concept,
                            String method, BigDecimal amount) {}
    public record NoShowRow(String date, String court, String customer, String phone) {}
}
