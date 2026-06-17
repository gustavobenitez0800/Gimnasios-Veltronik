package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de SALIDA de un turno. Aplana cancha y cliente a id+display
 * (la grilla no necesita los objetos completos).
 */
@Data
public class CourtBookingDTO {
    private UUID id;
    private UUID courtId;
    private String courtName;
    private UUID customerId;
    private String customerName;
    private String customerPhone;
    private LocalDateTime startAt;
    private LocalDateTime endAt;
    private String status;
    private BigDecimal totalPrice;
    private BigDecimal depositAmount;
    private LocalDateTime depositPaidAt;
    private String depositMethod;
    private BigDecimal amountPaid;
    private String paymentMethod;
    private LocalDateTime paidAt;
    private LocalDateTime expiresAt;
    private UUID recurringId;
    private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
