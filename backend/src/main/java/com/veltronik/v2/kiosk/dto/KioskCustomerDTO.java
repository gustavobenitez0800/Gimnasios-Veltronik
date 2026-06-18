package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class KioskCustomerDTO {
    private UUID id;
    private String fullName;
    private String phone;
    private String dniCuit;
    private BigDecimal creditLimit;
    private BigDecimal balance;
    private boolean active;
}
