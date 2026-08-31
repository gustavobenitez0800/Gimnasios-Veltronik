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

    // ── Situación de la cuota, calculada por el BACKEND ──
    //
    // POR QUÉ VIENE CALCULADA Y NO SE DEDUCE EN LA PANTALLA
    // La misma cuenta estaba escrita en cinco lugares del frontend, y no daban lo mismo: el
    // aviso del mostrador decía "hace 2 días" y la lista de socios "4d vencido" PARA LA MISMA
    // PERSONA. Dos errores que se sumaban — la lista recortaba la hora del vencimiento, y un
    // texto "2026-08-27" en JavaScript se lee como UTC, que en Argentina son tres horas antes.
    //
    // Un socio no puede deber dos cantidades distintas de días según qué pantalla mire. Ahora
    // lo decide UNA sola clase (MemberAccessPolicy, la misma que usa el check-in por QR) y las
    // pantallas solo muestran lo que llega.

    /** AL_DIA · EN_GRACIA · VENCIDO · SIN_DATOS · INACTIVO */
    private String situacion;

    /** Días vencido. 0 si está al día. */
    private Long diasVencido;

    /** Días que le quedan. 0 si ya venció. */
    private Long diasRestantes;

    /**
     * Visitas que le quedan. NULL = este gimnasio no lleva cupo de clases y la cobertura la
     * decide solo la fecha. Las pantallas solo lo pintan; quien lo calcula es MemberAccessPolicy.
     */
    private Integer clasesRestantes;
}
