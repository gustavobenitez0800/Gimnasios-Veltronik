package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Política de acceso operativo: la <b>ÚNICA fuente de verdad</b> de "¿este negocio tiene
 * acceso AHORA?".
 *
 * <p>La consultan las dos capas de defensa del Kill Switch:</p>
 * <ul>
 *   <li>{@link KillSwitchFilter} — barrera en tiempo real (cada request);</li>
 *   <li>{@link com.veltronik.v2.core.services.TenantSubscriptionJob} — cron nocturno.</li>
 * </ul>
 *
 * <p><b>Por qué existe:</b> antes esta regla estaba DUPLICADA en el filtro
 * ({@code hasValidSubscription}) y en la query del cron ({@code findExpiredActiveTenants}),
 * y <b>divergían</b>: el cron aceptaba una suscripción {@code active} con
 * {@code current_period_end} NULL como válida (acceso infinito), el filtro no. Centralizar
 * la decisión acá garantiza que ambas capas resuelvan idéntico, para siempre.</p>
 *
 * <p><b>Separación de conceptos (clave del modelo):</b></p>
 * <ul>
 *   <li>la habilitación <b>PAGA</b> vive en la suscripción ({@code current_period_end}):
 *       es la fuente autoritativa de "pagó en V2";</li>
 *   <li>la <b>PRUEBA gratis</b> vive en {@code tenant.trial_ends_at}.</li>
 * </ul>
 * Una suscripción otorga acceso solo con un período <b>concreto y futuro</b> (nunca NULL):
 * así, un dato heredado/migrado de V1 sin período real no puede habilitar a nadie.
 */
@Component
public class SubscriptionAccessPolicy {

    /** Motivo del veredicto (para logs/diagnóstico; no se expone al cliente). */
    public enum Reason {
        ACTIVE_SUBSCRIPTION,   // suscripción 'active' con período vigente
        IN_GRACE,              // 'past_due' dentro del período de gracia
        CANCELED_PAID_PERIOD,  // 'canceled' pero el mes ya pago sigue corriendo
        ACTIVE_TRIAL,          // prueba gratis vigente
        MASTER_DISABLED,       // baja manual a nivel maestro (tenant.is_active = false)
        NO_VALID_ENTITLEMENT   // activo a nivel maestro pero sin trial ni suscripción válida
    }

    public record Decision(boolean allowed, Reason reason) {
        public static Decision allow(Reason r) { return new Decision(true, r); }
        public static Decision block(Reason r) { return new Decision(false, r); }
    }

    /**
     * Evalúa el acceso de un negocio en el instante {@code now}.
     *
     * @param tenant el negocio (no debe ser null en uso normal).
     * @param latest la suscripción más reciente del tenant, o {@code null} si no se cargó
     *               (p. ej. el filtro la omite cuando hay trial vigente, para ahorrar un query).
     * @param now    el "ahora" del negocio (hora Argentina).
     */
    public Decision evaluate(Tenant tenant, Subscription latest, LocalDateTime now) {
        if (tenant == null) return Decision.block(Reason.NO_VALID_ENTITLEMENT);

        // Baja manual / persistida → bloqueo inmediato, sin importar trial ni suscripción.
        if (!tenant.isActive()) return Decision.block(Reason.MASTER_DISABLED);

        // 1) Habilitación PAGA (autoritativa): la da la suscripción con período vigente.
        Reason paid = subscriptionAccess(latest, now);
        if (paid != null) return Decision.allow(paid);

        // 2) PRUEBA gratis vigente.
        if (tenant.getTrialEndsAt() != null && tenant.getTrialEndsAt().isAfter(now)) {
            return Decision.allow(Reason.ACTIVE_TRIAL);
        }

        // 3) Activo a nivel maestro pero sin habilitación vigente → venció.
        return Decision.block(Reason.NO_VALID_ENTITLEMENT);
    }

    /**
     * ¿La suscripción otorga acceso pago vigente? Devuelve el motivo, o {@code null} si no habilita.
     * Exige período CONCRETO y futuro (nunca NULL): un 'active' sin período no es acceso.
     */
    private Reason subscriptionAccess(Subscription s, LocalDateTime now) {
        if (s == null || s.getStatus() == null) return null;
        return switch (s.getStatus()) {
            case "active"   -> isFuture(s.getCurrentPeriodEnd(), now)  ? Reason.ACTIVE_SUBSCRIPTION  : null;
            case "past_due" -> isFuture(s.getGracePeriodEndsAt(), now) ? Reason.IN_GRACE             : null;
            case "canceled" -> isFuture(s.getCurrentPeriodEnd(), now)  ? Reason.CANCELED_PAID_PERIOD : null;
            // pending, pending_payment, rejected, expired, etc. → NO otorgan acceso.
            default -> null;
        };
    }

    private boolean isFuture(LocalDateTime when, LocalDateTime now) {
        return when != null && when.isAfter(now);
    }
}
