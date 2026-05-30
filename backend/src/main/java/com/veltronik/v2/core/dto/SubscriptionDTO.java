package com.veltronik.v2.core.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class SubscriptionDTO {
    private UUID id;
    private UUID tenantId;
    private String status;
    private LocalDateTime currentPeriodStart;
    private LocalDateTime currentPeriodEnd;
    private LocalDateTime gracePeriodEndsAt;
    private String mpPayerEmail;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
