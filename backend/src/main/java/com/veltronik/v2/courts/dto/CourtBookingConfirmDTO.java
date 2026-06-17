package com.veltronik.v2.courts.dto;

import lombok.Data;

/**
 * Confirmar un turno (seña recibida). El método es opcional: si no viene,
 * el service asume efectivo (el caso más común en el mostrador).
 */
@Data
public class CourtBookingConfirmDTO {
    /** CASH | TRANSFER | MP (null → CASH). */
    private String method;
}
