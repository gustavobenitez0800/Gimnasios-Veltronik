package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/** Contrato de SALIDA de una regla de precio por franja. */
@Data
public class CourtPriceRuleDTO {
    private UUID id;
    private UUID courtId;
    private String courtName;
    private Integer dayOfWeek;
    private LocalTime timeFrom;
    private LocalTime timeTo;
    private BigDecimal price;
}
