package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/** Contrato de SALIDA de un turno fijo semanal. */
@Data
public class CourtRecurringBookingDTO {
    private UUID id;
    private UUID courtId;
    private String courtName;
    private UUID customerId;
    private String customerName;
    private String customerPhone;
    private int dayOfWeek;
    private LocalTime startTime;
    private LocalTime endTime;
    private BigDecimal agreedPrice;
    private LocalDate validFrom;
    private LocalDate validUntil;
    private boolean active;
    private String notes;
}
