package com.veltronik.v2.kiosk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Entrada para crear/editar un producto. Wrappers nullable → patch parcial (cierra
 * mass-assignment). {@code stockQuantity} solo se usa en el alta como stock inicial;
 * después el stock se mueve SOLO por movimientos (ventas, ajustes), nunca por edición directa.
 */
@Data
public class KioskProductInputDTO {
    private UUID categoryId;

    @NotBlank(message = "El nombre del producto es obligatorio")
    private String name;

    private String barcode;
    private BigDecimal costPrice;

    @NotNull(message = "El precio de venta es obligatorio")
    @PositiveOrZero(message = "El precio de venta no puede ser negativo")
    private BigDecimal salePrice;

    /** Stock inicial (solo en el alta). */
    private BigDecimal stockQuantity;
    private BigDecimal minStock;
    private Boolean weighable;
    private Boolean service;
    private BigDecimal ivaRate;
    private Boolean active;
}
