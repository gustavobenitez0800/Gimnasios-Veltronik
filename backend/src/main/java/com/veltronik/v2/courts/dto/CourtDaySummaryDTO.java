package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * Resumen del día para la barra de la grilla y la caja: el dueño entiende su jornada
 * de un vistazo (cuántos turnos, qué ocupación, cuánta plata esperada / ya cobrada /
 * pendiente). {@code collected*} cuenta la plata cuyo COBRO cae en la fecha consultada
 * (señas + saldos), sin importar de qué día sea el turno.
 */
@Data
public class CourtDaySummaryDTO {
    private String date;

    /** Turnos reales del día (excluye bloqueos y cancelados/expirados). */
    private int totalBookings;
    private int occupancyPct;          // 0..100, sobre la capacidad horaria de las canchas

    private BigDecimal expectedRevenue;   // total de los turnos del día (pendiente + confirmado + cerrado)
    private BigDecimal collectedToday;     // plata que entró en la fecha (señas + saldos)
    private BigDecimal collectedCash;
    private BigDecimal collectedTransfer;
    private BigDecimal collectedMp;

    private int pendingDepositCount;       // turnos esperando seña
    private BigDecimal pendingDepositAmount;
    private BigDecimal pendingBalance;     // saldo de turnos del día todavía sin cobrar
}
