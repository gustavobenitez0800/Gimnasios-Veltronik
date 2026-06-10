package com.veltronik.v2.courts.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Turno fijo semanal ("los lunes a las 21 la tiene el equipo de Juan").
 *
 * <p>Es una PLANTILLA: no ocupa la grilla por sí misma. Un job diario (y el alta/edición)
 * materializa las próximas semanas como {@link CourtBooking} CONFIRMED con
 * {@code recurring_id} apuntando acá. Si el slot ya está ocupado por otra reserva,
 * esa fecha se saltea (el índice único lo garantiza).</p>
 */
@Entity
@Table(name = "court_recurring_booking")
@Getter
@Setter
public class CourtRecurringBooking extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "court_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Court court;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "customer_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private CourtCustomer customer;

    /** Día de la semana ISO: 1 = lunes ... 7 = domingo. */
    @Column(name = "day_of_week", nullable = false)
    private int dayOfWeek;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    /** Precio pactado del turno fijo. Null = se resuelve por reglas de precio al materializar. */
    @Column(name = "agreed_price")
    private BigDecimal agreedPrice;

    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;

    /** Null = sin fecha de fin. */
    @Column(name = "valid_until")
    private LocalDate validUntil;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(columnDefinition = "text")
    private String notes;
}
