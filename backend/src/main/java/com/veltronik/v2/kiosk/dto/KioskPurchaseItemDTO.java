package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class KioskPurchaseItemDTO {
    private UUID id;
    private UUID productId;
    private String productName;
    private BigDecimal quantity;
    private BigDecimal unitCost;
    private BigDecimal subtotal;
}
