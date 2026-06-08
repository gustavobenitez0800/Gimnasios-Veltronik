package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de SALIDA para una clase/actividad del gimnasio.
 *
 * <p>Reemplaza la exposición de la entidad JPA cruda ({@code GymClass}) — Mandamiento #5.
 * Nombres en camelCase, que es el contrato que consume el {@code ClassService} del frontend
 * (su adaptador traduce camelCase ↔ la forma de la vista). El día/hora son strings tal como
 * se persisten; {@code active} viaja como JSON {@code "active"} (Jackson) — el front lo lee así.</p>
 */
@Data
public class GymClassDTO {
    private UUID id;
    private String name;
    private String instructor;
    private String dayOfWeek;
    private String startTime;
    private String endTime;
    private int capacity;
    private String room;
    private String color;
    private String description;
    private boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
