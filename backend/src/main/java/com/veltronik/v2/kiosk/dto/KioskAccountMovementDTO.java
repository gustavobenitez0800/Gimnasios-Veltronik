package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class KioskAccountMovementDTO {
    private UUID id;
    private String type;
    private BigDecimal amount;
    private UUID saleId;
    private String notes;
    private LocalDateTime createdAt;
}
