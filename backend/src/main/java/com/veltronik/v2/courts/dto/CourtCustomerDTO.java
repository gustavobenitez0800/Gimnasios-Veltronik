package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Contrato de SALIDA de un cliente del complejo. */
@Data
public class CourtCustomerDTO {
    private UUID id;
    private String fullName;
    private String phone;
    private String email;
    private String notes;
    private int noShowCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
