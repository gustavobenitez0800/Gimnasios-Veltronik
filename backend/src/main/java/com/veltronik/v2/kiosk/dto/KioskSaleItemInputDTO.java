package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class KioskSaleItemInputDTO {
    @NotNull(message = "El producto del renglón es obligatorio")
    private UUID productId;

    @NotNull(message = "La cantidad es obligatoria")
    @Positive(message = "La cantidad debe ser mayor a cero")
    private BigDecimal quantity;
}
