package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** Entrada para crear/editar un proveedor. Patch parcial. */
@Data
public class KioskSupplierInputDTO {
    @NotBlank(message = "El nombre del proveedor es obligatorio")
    private String name;
    private String phone;
    private String cuit;
    private String notes;
    private Boolean active;
}
