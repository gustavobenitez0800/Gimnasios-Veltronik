package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ajuste manual de inventario por recuento físico. El usuario informa la cantidad REAL
 * contada; el service calcula el delta contra el cache y registra un movimiento ADJUSTMENT.
 */
@Data
public class KioskStockAdjustmentInputDTO {
    @NotNull(message = "El producto es obligatorio")
    private UUID productId;

    @NotNull(message = "La cantidad contada es obligatoria")
    private BigDecimal countedQuantity;

    private String reason;
}
