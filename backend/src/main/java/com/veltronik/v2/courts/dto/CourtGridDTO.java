package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.util.List;

/**
 * Respuesta compuesta de la grilla del día: un solo round-trip para dibujar todo
 * (config del tenant + canchas activas + turnos del día).
 */
@Data
public class CourtGridDTO {
    private String date;
    private CourtSettingsDTO settings;
    private List<CourtDTO> courts;
    private List<CourtBookingDTO> bookings;
}
