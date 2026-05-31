package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de salida para los socios del gimnasio.
 *
 * Reemplaza la exposición de la entidad JPA cruda (Mandamiento #5). Replica los
 * nombres de campo que consume el frontend (useMemberController / searchForAccess);
 * `dni` se expone como alias de `document` por compatibilidad con la UI legacy.
 * El frontend arma el nombre para mostrar a partir de firstName/lastName.
 */
@Data
public class GymMemberDTO {
    private UUID id;
    private String firstName;
    private String lastName;
    /** Nombre completo listo para mostrar, calculado en el backend. */
    private String fullName;
    private String email;
    private String phone;
    private String document;
    /** Alias de {@code document} para compatibilidad con el frontend legacy. */
    private String dni;
    private boolean active;
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
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
