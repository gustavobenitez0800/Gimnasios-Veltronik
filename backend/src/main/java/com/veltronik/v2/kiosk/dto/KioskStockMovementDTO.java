package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class KioskStockMovementDTO {
    private UUID id;
    private UUID productId;
    private String productName;
    private String type;
    private BigDecimal quantity;
    private String reason;
    private UUID saleId;
    private LocalDateTime createdAt;
    private UUID createdBy;
}
