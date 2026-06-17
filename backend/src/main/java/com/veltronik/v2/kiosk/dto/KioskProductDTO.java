package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class KioskProductDTO {
    private UUID id;
    private UUID categoryId;
    private String categoryName;
    private String name;
    private String barcode;
    private BigDecimal costPrice;
    private BigDecimal salePrice;
    private BigDecimal stockQuantity;
    private BigDecimal minStock;
    private boolean weighable;
    private boolean service;
    private BigDecimal ivaRate;
    private boolean active;
    /** Derivado: ¿está en o por debajo del mínimo? (para pintar la alerta en la grilla). */
    private boolean lowStock;
}
