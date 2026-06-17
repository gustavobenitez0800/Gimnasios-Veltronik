package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;

/** Apertura de caja: fondo inicial. */
@Data
public class KioskCashOpenInputDTO {
    @NotNull(message = "El fondo de apertura es obligatorio")
    @PositiveOrZero(message = "El fondo no puede ser negativo")
    private BigDecimal openingAmount;
}
