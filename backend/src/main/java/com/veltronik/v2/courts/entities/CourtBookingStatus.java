package com.veltronik.v2.courts.entities;

/**
 * Máquina de estados del turno de cancha.
 *
 * <pre>
 * PENDING_DEPOSIT ──pago seña (webhook F1.5)──► CONFIRMED ──jugaron──► COMPLETED
 *       │                                           │
 *       │ expires_at vencido (cron)                 ├──► CANCELLED
 *       ▼                                           └──► NO_SHOW (suma noShowCount)
 *    EXPIRED (slot liberado)
 *
 * MAINTENANCE: bloqueo del dueño (lluvia, arreglos, escuelita). Sale con CANCELLED.
 * </pre>
 *
 * <p>El índice único parcial de la BD (court_id, start_at) excluye CANCELLED y EXPIRED:
 * esos estados liberan el slot; el resto lo ocupa.</p>
 */
public enum CourtBookingStatus {
    /** Esperando la seña (amarillo en la grilla). Nace con {@code expiresAt}. */
    PENDING_DEPOSIT,
    /** Señado / confirmado (rojo en la grilla). */
    CONFIRMED,
    /** El turno se jugó y se cerró. */
    COMPLETED,
    /** Cancelado por el dueño o el cliente. Libera el slot. */
    CANCELLED,
    /** La seña no llegó a tiempo (cron). Libera el slot. */
    EXPIRED,
    /** Estaba confirmado y el equipo no vino. */
    NO_SHOW,
    /** Bloqueo del dueño: mantenimiento, lluvia, escuelita (gris en la grilla). */
    MAINTENANCE
}
