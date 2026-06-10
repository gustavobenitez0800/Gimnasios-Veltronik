package com.veltronik.v2.courts.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Un turno de cancha (la celda de la grilla).
 *
 * <p><b>Anti doble-reserva:</b> además del chequeo de solapamiento del service, la BD tiene
 * un índice único parcial sobre {@code (court_id, start_at)} que excluye CANCELLED/EXPIRED.
 * Si dos requests compiten por el mismo slot, una recibe la constraint violation y el
 * service la traduce a 409 "Ese horario se acaba de ocupar". Sin races posibles.</p>
 *
 * <p>Los horarios son hora local de Argentina ({@code LocalDateTime}), igual que el resto
 * del dominio (la zona de la JVM está fijada a America/Argentina/Buenos_Aires).</p>
 */
@Entity
@Table(name = "court_booking")
@Getter
@Setter
public class CourtBooking extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "court_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Court court;

    /** Null solo para MAINTENANCE (los bloqueos no tienen cliente). */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "customer_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private CourtCustomer customer;

    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private LocalDateTime endAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CourtBookingStatus status = CourtBookingStatus.CONFIRMED;

    /** Precio total de la cancha (sin cantina). */
    @Column(name = "total_price")
    private BigDecimal totalPrice;

    /** Monto de la seña pedida. */
    @Column(name = "deposit_amount")
    private BigDecimal depositAmount;

    /** Cuándo se acreditó la seña (manual hoy; webhook MP en Fase 1.5). */
    @Column(name = "deposit_paid_at")
    private LocalDateTime depositPaidAt;

    /** id del pago de Mercado Pago de la seña (Fase 1.5, idempotencia del webhook). */
    @Column(name = "mp_payment_id", length = 50)
    private String mpPaymentId;

    /** Solo PENDING_DEPOSIT: si no llega la seña antes de esto, el cron lo pasa a EXPIRED. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** Si nació de un turno fijo, la plantilla que lo generó. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recurring_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private CourtRecurringBooking recurring;

    @Column(columnDefinition = "text")
    private String notes;
}
