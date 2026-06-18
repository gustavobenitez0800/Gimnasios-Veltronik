package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;

/** Registro de un pago de la cuenta corriente (el cliente salda parte/todo lo que debe). */
@Data
public class KioskAccountPaymentInputDTO {
    @NotNull(message = "El monto del pago es obligatorio")
    @Positive(message = "El monto debe ser mayor a cero")
    private BigDecimal amount;

    private String notes;
}
