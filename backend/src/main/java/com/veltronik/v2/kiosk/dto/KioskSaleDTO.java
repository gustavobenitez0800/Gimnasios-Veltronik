package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
public class KioskSaleDTO {
    private UUID id;
    private UUID clientUuid;
    private UUID cashSessionId;
    private UUID customerId;
    private String customerName;
    private BigDecimal subtotal;
    private BigDecimal surcharge;
    private BigDecimal total;
    private String status;
    private UUID soldBy;
    private String notes;
    private LocalDateTime createdAt;
    private List<KioskSaleItemDTO> items;
    private List<KioskSalePaymentDTO> payments;
}
