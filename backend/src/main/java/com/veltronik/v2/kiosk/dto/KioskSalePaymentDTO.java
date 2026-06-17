package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class KioskSalePaymentDTO {
    private UUID id;
    private String method;
    private BigDecimal amount;
}
