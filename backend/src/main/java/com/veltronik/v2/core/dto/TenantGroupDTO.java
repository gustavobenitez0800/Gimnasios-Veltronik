package com.veltronik.v2.core.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

/**
 * DTO de un grupo de sucursales. El frontend nunca recibe la entidad JPA cruda.
 */
@Data
public class TenantGroupDTO {
    private UUID id;

    @NotBlank(message = "El nombre del grupo es obligatorio")
    private String name;

    private String color;
    private int sortOrder;
}
