package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class KioskCashSessionDTO {
    private UUID id;
    private String status;
    private BigDecimal openingAmount;
    private LocalDateTime openedAt;
    private UUID openedBy;
    private BigDecimal closingDeclared;
    private BigDecimal closingExpected;
    private BigDecimal difference;
    private LocalDateTime closedAt;
    private UUID closedBy;
}
