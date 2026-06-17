package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class KioskSalePaymentInputDTO {
    @NotBlank(message = "El medio de pago es obligatorio")
    private String method;

    @NotNull(message = "El monto del pago es obligatorio")
    @Positive(message = "El monto debe ser mayor a cero")
    private BigDecimal amount;
}
