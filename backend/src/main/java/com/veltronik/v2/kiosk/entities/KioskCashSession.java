package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Sesión de caja (turno). Apertura con fondo → ventas → cierre con arqueo.
 *
 * <p><b>Invariante dura:</b> a lo sumo UNA {@code OPEN} por tenant (índice único parcial
 * {@code ux_kiosk_cash_session_open}). Es el equivalente kiosco a la regla anti doble-reserva
 * de canchas: la decide la base de datos, no el código.</p>
 */
@Entity
@Table(name = "kiosk_cash_session")
@Getter
@Setter
public class KioskCashSession extends TenantAwareEntity {

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private KioskCashSessionStatus status = KioskCashSessionStatus.OPEN;

    /** Fondo inicial con el que abre la caja. */
    @Column(name = "opening_amount", nullable = false)
    private BigDecimal openingAmount = BigDecimal.ZERO;

    @Column(name = "opened_at", nullable = false)
    private LocalDateTime openedAt;

    @Column(name = "opened_by")
    private UUID openedBy;

    /** Efectivo declarado por el kiosquero al cerrar (lo que contó). */
    @Column(name = "closing_declared")
    private BigDecimal closingDeclared;

    /** Efectivo esperado por el sistema: fondo + Σ pagos en efectivo de la sesión. */
    @Column(name = "closing_expected")
    private BigDecimal closingExpected;

    /** {@code declared - expected}: faltante (negativo) o sobrante (positivo). */
    @Column(name = "difference")
    private BigDecimal difference;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;
}
