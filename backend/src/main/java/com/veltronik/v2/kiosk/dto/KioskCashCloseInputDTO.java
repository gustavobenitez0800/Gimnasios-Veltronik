package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;

/** Cierre de caja: efectivo contado por el kiosquero. El sistema calcula la diferencia. */
@Data
public class KioskCashCloseInputDTO {
    @NotNull(message = "El efectivo contado es obligatorio")
    @PositiveOrZero(message = "El efectivo contado no puede ser negativo")
    private BigDecimal closingDeclared;
}
