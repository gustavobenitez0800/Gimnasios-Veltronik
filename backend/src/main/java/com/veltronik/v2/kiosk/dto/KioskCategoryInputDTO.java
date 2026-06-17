package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** Entrada para crear/editar un rubro. Wrappers nullable → patch parcial. */
@Data
public class KioskCategoryInputDTO {
    @NotBlank(message = "El nombre del rubro es obligatorio")
    private String name;
    private Integer displayOrder;
    private Boolean active;
}
