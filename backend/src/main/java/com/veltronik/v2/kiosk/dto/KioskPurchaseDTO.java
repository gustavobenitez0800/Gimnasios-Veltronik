package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
public class KioskPurchaseDTO {
    private UUID id;
    private UUID supplierId;
    private String supplierName;
    private LocalDate purchaseDate;
    private BigDecimal total;
    private String notes;
    private LocalDateTime createdAt;
    private List<KioskPurchaseItemDTO> items;
}
