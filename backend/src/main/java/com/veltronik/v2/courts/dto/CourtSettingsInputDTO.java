package com.veltronik.v2.courts.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalTime;

/** Contrato de ENTRADA para editar la configuración (patch parcial: null = no tocar). */
@Data
public class CourtSettingsInputDTO {
    @Min(value = 15, message = "El slot mínimo es de 15 minutos")
    @Max(value = 240, message = "El slot máximo es de 240 minutos")
    private Integer slotDurationMinutes;
    private LocalTime openingTime;
    private LocalTime closingTime;
    private BigDecimal defaultPrice;
    private BigDecimal depositAmount;
    @Min(value = 5, message = "El timeout mínimo de seña es de 5 minutos")
    @Max(value = 1440, message = "El timeout máximo de seña es de 24 horas")
    private Integer depositTimeoutMinutes;
}
