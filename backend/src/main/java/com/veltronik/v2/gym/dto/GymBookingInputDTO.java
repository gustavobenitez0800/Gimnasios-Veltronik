package com.veltronik.v2.gym.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Contrato de ENTRADA para crear una reserva de clase.
 *
 * <p>Reemplaza al {@code Map<String, Object>} sin tipar: con el Map, un body sin
 * {@code member_id} producía un NPE → 500 "error inesperado"; con el DTO validado el
 * cliente recibe un 400 claro. Acepta tanto camelCase como los alias snake_case que
 * usaba el contrato original.</p>
 */
@Data
public class GymBookingInputDTO {

    @NotNull(message = "El socio es obligatorio")
    @JsonAlias({"member_id"})
    private UUID memberId;

    @NotNull(message = "La fecha de la reserva es obligatoria")
    @JsonAlias({"booking_date"})
    private LocalDate bookingDate;
}
