package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** Contrato de ENTRADA para crear/editar un cliente. El teléfono se normaliza en el service. */
@Data
public class CourtCustomerInputDTO {
    @NotBlank(message = "El nombre del cliente es obligatorio")
    private String fullName;
    @NotBlank(message = "El teléfono es obligatorio")
    private String phone;
    private String email;
    private String notes;
}
