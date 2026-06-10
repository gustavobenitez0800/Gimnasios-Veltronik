package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Contrato de ENTRADA para crear/editar un turno fijo. Igual que el turno suelto,
 * el cliente puede venir por id o por nombre+teléfono (busca-o-crea).
 * {@code endTime} opcional: default = startTime + slot del tenant.
 */
@Data
public class CourtRecurringBookingInputDTO {
    @NotNull(message = "La cancha es obligatoria")
    private UUID courtId;

    private UUID customerId;
    private String customerName;
    private String customerPhone;

    @NotNull(message = "El día de la semana es obligatorio")
    @Min(value = 1, message = "dayOfWeek va de 1 (lunes) a 7 (domingo)")
    @Max(value = 7, message = "dayOfWeek va de 1 (lunes) a 7 (domingo)")
    private Integer dayOfWeek;

    @NotNull(message = "La hora de inicio es obligatoria")
    private LocalTime startTime;

    private LocalTime endTime;

    private BigDecimal agreedPrice;
    private LocalDate validFrom;
    private LocalDate validUntil;
    private Boolean active;
    private String notes;
}
