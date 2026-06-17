package com.veltronik.v2.courts.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalTime;

/**
 * Configuración del vertical de canchas. UNA fila por tenant (se crea lazy con defaults
 * de Fútbol 5 al primer acceso).
 *
 * <p>Acá vive la diferencia entre deportes: F5 = slots de 60'; cuando exista PADEL,
 * ese tenant configura 90' y la grilla se redibuja sola. Cero código nuevo.</p>
 */
@Entity
@Table(name = "court_settings", uniqueConstraints = {
        @UniqueConstraint(name = "ux_court_settings_tenant", columnNames = {"tenant_id"})
})
@Getter
@Setter
public class CourtSettings extends TenantAwareEntity {

    /** Duración del slot de la grilla. F5 = 60. Pádel (futuro) = 90. */
    @Column(name = "slot_duration_minutes", nullable = false)
    private int slotDurationMinutes = 60;

    @Column(name = "opening_time", nullable = false)
    private LocalTime openingTime = LocalTime.of(9, 0);

    /** Hora del ÚLTIMO cierre (medianoche = 00:00 se modela como 23:59 del mismo día). */
    @Column(name = "closing_time", nullable = false)
    private LocalTime closingTime = LocalTime.of(23, 0);

    /** Precio base del turno cuando ninguna regla de franja matchea. */
    @Column(name = "default_price")
    private BigDecimal defaultPrice;

    /** Seña sugerida al crear un turno PENDING_DEPOSIT. */
    @Column(name = "deposit_amount")
    private BigDecimal depositAmount;

    /** Minutos para pagar la seña antes de que el cron libere el slot. */
    @Column(name = "deposit_timeout_minutes", nullable = false)
    private int depositTimeoutMinutes = 15;

    /**
     * Alias / CBU donde el cliente transfiere la seña. Lo usa el mensaje de WhatsApp
     * "pedir seña" (1-click) para que el encargado no tenga que tipearlo cada vez.
     */
    @Column(name = "payment_alias", length = 120)
    private String paymentAlias;

    // ─── Bot de WhatsApp (Fase 3) ───

    /** Master switch del bot para este complejo. */
    @Column(name = "bot_enabled", nullable = false)
    private boolean botEnabled = false;

    /** phone_number_id de Meta: enruta el webhook entrante → este tenant. Único. */
    @Column(name = "wa_phone_number_id", length = 40)
    private String waPhoneNumberId;

    /** Token de Graph API para responderle al cliente. SENSIBLE: nunca se expone al front. */
    @Column(name = "wa_access_token", columnDefinition = "text")
    private String waAccessToken;

    /** Instrucciones extra para el bot (datos del complejo: estacionamiento, cantina, etc.). */
    @Column(name = "bot_instructions", columnDefinition = "text")
    private String botInstructions;
}
