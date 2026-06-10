package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Drag & drop de la grilla: mover un turno a otra cancha y/u otro horario. */
@Data
public class CourtBookingMoveDTO {
    @NotNull(message = "La cancha destino es obligatoria")
    private UUID courtId;

    @NotNull(message = "El horario destino es obligatorio")
    private LocalDateTime startAt;
}
