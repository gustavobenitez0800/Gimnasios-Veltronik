package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.util.UUID;

/**
 * Resumen mínimo de un socio para anidar dentro de otros DTOs (ej: un pago).
 *
 * Expone solo lo que la vista necesita para identificar al socio, sin arrastrar
 * la entidad JPA completa (ni sus asociaciones, ni el tenant). El frontend
 * construye el nombre para mostrar a partir de firstName/lastName.
 */
@Data
public class GymMemberSummaryDTO {
    private UUID id;
    private String firstName;
    private String lastName;
    private String document;

    /** Nombre para mostrar, calculado en el backend (lo consume el front de Acceso/Pagos). */
    public String getFullName() {
        String fn = firstName != null ? firstName : "";
        String ln = lastName != null ? lastName : "";
        return (fn + " " + ln).trim();
    }

    /** Alias legacy de {@code document} (DNI) que consume el frontend. */
    public String getDni() {
        return document;
    }
}
