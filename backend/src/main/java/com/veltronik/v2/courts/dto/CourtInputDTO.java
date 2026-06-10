package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Contrato de ENTRADA para crear/editar una cancha. Solo campos editables
 * (sin id/tenant/timestamps). Wrappers para distinguir "no vino" en el patch parcial.
 */
@Data
public class CourtInputDTO {
    @NotBlank(message = "El nombre de la cancha es obligatorio")
    private String name;
    private String surface;
    private Boolean covered;
    private Boolean active;
    private Integer displayOrder;
    private String notes;
}
