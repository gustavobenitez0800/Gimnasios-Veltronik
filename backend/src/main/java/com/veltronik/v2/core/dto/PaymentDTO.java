package com.veltronik.v2.core.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class PaymentDTO {
    private UUID id;
    private UUID tenantId;
    private UUID memberId;
    private BigDecimal amount;
    private LocalDateTime paymentDate;
    private String paymentMethod;
    private String status;
    private String description;
    private BigDecimal tip;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
