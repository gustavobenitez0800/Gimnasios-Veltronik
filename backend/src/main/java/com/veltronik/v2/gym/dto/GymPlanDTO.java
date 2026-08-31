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
    private Integer classes;

    private Boolean active;
}
