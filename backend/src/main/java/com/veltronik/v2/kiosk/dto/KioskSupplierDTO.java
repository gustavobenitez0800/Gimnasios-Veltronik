package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.util.UUID;

@Data
public class KioskSupplierDTO {
    private UUID id;
    private String name;
    private String phone;
    private String cuit;
    private String notes;
    private boolean active;
}
