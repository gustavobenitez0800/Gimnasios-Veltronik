package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.util.UUID;

@Data
public class KioskCategoryDTO {
    private UUID id;
    private String name;
    private int displayOrder;
    private boolean active;
}
