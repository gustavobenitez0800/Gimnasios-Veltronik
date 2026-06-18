package com.veltronik.v2.fiscal.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Salida de un comprobante para la pantalla de facturación. */
@Data
public class FiscalVoucherDTO {
    private UUID id;
    private String voucherType;
    private Integer pointOfSale;
    private Long number;
    private LocalDate voucherDate;
    private BigDecimal totalAmount;
    private String cae;
    private LocalDate caeExpiration;
    private String qrUrl;
    private String status;
    private String arcaObservations;
    private LocalDateTime createdAt;
}
