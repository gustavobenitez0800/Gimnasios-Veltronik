package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.util.List;

/** Disponibilidad pública de una fecha: horarios libres por cancha. Nunca expone quién reservó. */
@Data
public class CourtPublicAvailabilityDTO {
    private String date;
    private List<CourtFree> courts;

    public record CourtFree(String courtId, String court, List<String> freeSlots) {}
}
