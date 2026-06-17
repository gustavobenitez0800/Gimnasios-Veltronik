package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;

/**
 * Info pública del complejo para la página de reservas online (sin datos sensibles:
 * nada de clientes ni finanzas, solo lo que el cliente final necesita para reservar).
 */
@Data
public class CourtPublicVenueDTO {
    private String name;
    private int slotDurationMinutes;
    private LocalTime openingTime;
    private LocalTime closingTime;
    private BigDecimal depositAmount;
    private String paymentAlias;
    private String whatsappNumber;
    private List<CourtBrief> courts;

    public record CourtBrief(String id, String name, String surface, boolean covered) {}
}
