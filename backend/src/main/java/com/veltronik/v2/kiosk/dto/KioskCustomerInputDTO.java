package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.math.BigDecimal;

/** Entrada para crear/editar un cliente de cuenta corriente. Patch parcial. */
@Data
public class KioskCustomerInputDTO {
    @NotBlank(message = "El nombre del cliente es obligatorio")
    private String fullName;
    private String phone;
    private String dniCuit;
    private BigDecimal creditLimit;
    private Boolean active;
}
