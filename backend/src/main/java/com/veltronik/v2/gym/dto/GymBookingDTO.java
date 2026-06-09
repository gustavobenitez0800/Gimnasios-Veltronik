package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Contrato de salida para las reservas de clases.
 *
 * Es la ÚNICA forma en que una reserva viaja al frontend (Mandamiento #5: nunca se
 * expone la entidad JPA cruda). El socio va anidado como {@link GymMemberSummaryDTO}
 * y de la clase solo viajan el id y el nombre (lo que una vista necesita para listar).
 */
@Data
public class GymBookingDTO {
    private UUID id;
    private UUID classId;
    private String className;
    private LocalDate bookingDate;
    private String status;

    /** Socio que reservó. */
    private GymMemberSummaryDTO member;
}
