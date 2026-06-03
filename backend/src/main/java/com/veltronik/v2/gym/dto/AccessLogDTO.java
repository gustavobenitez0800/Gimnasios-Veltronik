package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de SALIDA para un registro de acceso (entrada/salida de un socio).
 *
 * Reemplaza la exposición de la entidad {@link com.veltronik.v2.gym.entities.AccessLog}
 * cruda (Mandamiento #5). El socio viaja como {@link GymMemberSummaryDTO} (que expone
 * fullName/dni, lo que consume el frontend de Acceso y Reportes), sin arrastrar la
 * entidad JPA completa ni el tenant.
 */
@Data
public class AccessLogDTO {
    private UUID id;
    private LocalDateTime checkInAt;
    private LocalDateTime checkOutAt;
    private String accessMethod;
    private String notes;
    /** Socio del acceso (id, nombre, dni). */
    private GymMemberSummaryDTO member;
}
