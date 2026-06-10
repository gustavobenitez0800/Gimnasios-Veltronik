package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/** Contrato de ENTRADA para crear/editar una regla de precio. */
@Data
public class CourtPriceRuleInputDTO {
    /** Null = aplica a todas las canchas. */
    private UUID courtId;

    /** Día ISO (1 = lunes ... 7 = domingo). Null = todos los días. */
    @Min(value = 1, message = "dayOfWeek va de 1 (lunes) a 7 (domingo)")
    @Max(value = 7, message = "dayOfWeek va de 1 (lunes) a 7 (domingo)")
    private Integer dayOfWeek;

    @NotNull(message = "El inicio de la franja es obligatorio")
    private LocalTime timeFrom;

    @NotNull(message = "El fin de la franja es obligatorio")
    private LocalTime timeTo;

    @NotNull(message = "El precio es obligatorio")
    @Min(value = 0, message = "El precio no puede ser negativo")
    private BigDecimal price;
}
