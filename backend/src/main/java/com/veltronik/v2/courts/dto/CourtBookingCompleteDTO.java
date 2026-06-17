package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * Cerrar (cobrar) un turno jugado. Registra cuánto entró de saldo y por qué medio
 * — es lo que alimenta la caja del día.
 */
@Data
public class CourtBookingCompleteDTO {
    /** Saldo cobrado al cerrar. Null → el service usa total − seña ya cobrada. */
    private BigDecimal amountPaid;
    /** CASH | TRANSFER | MP (null → CASH). */
    private String method;
}
