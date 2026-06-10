package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Contrato de SALIDA de una cancha (nunca la entidad JPA cruda — Mandamiento #5). */
@Data
public class CourtDTO {
    private UUID id;
    private String name;
    private String surface;
    private boolean covered;
    private boolean active;
    private int displayOrder;
    private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
