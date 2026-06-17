package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/** Pedido de reserva desde el link público. El cliente se identifica por su teléfono. */
@Data
public class CourtPublicBookInputDTO {
    @NotNull(message = "Elegí la cancha")
    private UUID courtId;
    @NotBlank(message = "Elegí la fecha")
    private String date;        // YYYY-MM-DD
    @NotBlank(message = "Elegí el horario")
    private String startTime;   // HH:mm
    private Integer durationMinutes;
    @NotBlank(message = "Ingresá tu nombre")
    private String customerName;
    @NotBlank(message = "Ingresá tu WhatsApp")
    private String customerPhone;
}
