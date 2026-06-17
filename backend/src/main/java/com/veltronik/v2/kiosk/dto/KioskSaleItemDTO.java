package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class KioskSaleItemDTO {
    private UUID id;
    private UUID productId;
    private String productName;
    private BigDecimal unitPrice;
    private BigDecimal ivaRate;
    private BigDecimal quantity;
    private BigDecimal lineTotal;
}
