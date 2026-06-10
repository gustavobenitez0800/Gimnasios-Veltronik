package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de ENTRADA para crear un turno desde la grilla.
 *
 * <p>Cliente: o viene {@code customerId} (cliente existente) o vienen
 * {@code customerName + customerPhone} y el backend lo busca-o-crea por teléfono
 * (flujo mostrador: el dueño tipea nombre y celu y listo). Para MAINTENANCE no
 * hace falta cliente.</p>
 *
 * <p>{@code endAt} es opcional: si no viene, se calcula como
 * {@code startAt + slotDurationMinutes} de la configuración del tenant.
 * {@code totalPrice} opcional: si no viene, lo resuelven las reglas de precio.</p>
 */
@Data
public class CourtBookingInputDTO {
    @NotNull(message = "La cancha es obligatoria")
    private UUID courtId;

    @NotNull(message = "El horario de inicio es obligatorio")
    private LocalDateTime startAt;

    private LocalDateTime endAt;

    /** "CONFIRMED" (default), "PENDING_DEPOSIT" o "MAINTENANCE". */
    private String status;

    private UUID customerId;
    private String customerName;
    private String customerPhone;

    private BigDecimal totalPrice;
    private BigDecimal depositAmount;
    private String notes;
}
