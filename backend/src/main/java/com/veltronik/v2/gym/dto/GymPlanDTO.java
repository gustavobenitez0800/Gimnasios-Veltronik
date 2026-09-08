package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Un arancel, como lo ven las pantallas.
 *
 * <p>Sirve de ida y de vuelta: el alta usa los mismos campos que la lectura, y el {@code id}
 * se ignora al crear. Es un objeto chico y sin secretos —nombre, precio y qué otorga—, así que
 * no hace falta partirlo en dos contratos como pasa con socios y pagos.</p>
 */
@Data
public class GymPlanDTO {
    private UUID id;
    private String name;
    private BigDecimal price;

    /** Días que otorga. 0 = no mueve la fecha. */
    private Integer durationDays;

    /** Visitas que otorga. NULL = este arancel no cuenta visitas. */
    /**
     * Cuánto tiempo cubre, junto con {@link #coberturaUnidad}. 0 = no cubre tiempo.
     *
     * <p>Reemplaza a {@link #durationDays} desde el ADR-013: un mes no son 30 días, así que
     * hace falta la unidad para poder decir "el mismo día del mes que viene".</p>
     */
    private Integer coberturaCantidad;

    /** {@code DIA} o {@code MES}. */
    private String coberturaUnidad;

    private Integer classes;

    private Boolean active;
}
