package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * Contrato de ENTRADA para crear/editar un socio.
 *
 * <p>Existe para cerrar el mass-assignment: el controller ya NO recibe la entidad JPA
 * cruda ({@code GymMember}), sino este DTO con SOLO los campos editables. Así el cliente
 * no puede inyectar {@code id}, {@code tenant}, {@code userId} ni los timestamps por el
 * cuerpo del request. Replica los nombres de campo que ya envía el frontend (incluido el
 * alias {@code dni}), por lo que el front NO requiere cambios.</p>
 */
@Data
public class GymMemberInputDTO {
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String document;
    /** Alias legacy: el frontend puede mandar {@code dni} en vez de {@code document}. */
    private String dni;
    private Boolean active;
    private LocalDateTime membershipStart;
    private LocalDateTime membershipEnd;
    private String attendanceDays;
    private String notes;
    private String birthDate;
    private String address;
    private String emergencyContact;
    private String emergencyPhone;
    private String gender;
    private String objectives;
    private String photoUrl;

    /** Documento efectivo: prioriza {@code document}, cae a {@code dni} (compat front legacy). */
    public String resolveDocument() {
        if (document != null && !document.isBlank()) return document;
        return (dni != null && !dni.isBlank()) ? dni : null;
    }
}
