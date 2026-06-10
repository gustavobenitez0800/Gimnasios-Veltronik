package com.veltronik.v2.courts.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalTime;

/**
 * Regla de precio por franja horaria ("la nocturna vale más", "el finde vale más").
 *
 * <p>Resolución por especificidad (ver {@code CourtPriceRuleService.resolvePrice}):
 * cancha+día &gt; cancha &gt; día &gt; general. Si ninguna regla matchea, se usa
 * {@code CourtSettings.defaultPrice}.</p>
 */
@Entity
@Table(name = "court_price_rule")
@Getter
@Setter
public class CourtPriceRule extends TenantAwareEntity {

    /** Null = aplica a todas las canchas. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "court_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Court court;

    /** Día ISO (1 = lunes ... 7 = domingo). Null = todos los días. */
    @Column(name = "day_of_week")
    private Integer dayOfWeek;

    /** Inicio de la franja (inclusive). */
    @Column(name = "time_from", nullable = false)
    private LocalTime timeFrom;

    /** Fin de la franja (exclusivo). */
    @Column(name = "time_to", nullable = false)
    private LocalTime timeTo;

    /** Precio del turno completo en esta franja. */
    @Column(nullable = false)
    private BigDecimal price;
}
