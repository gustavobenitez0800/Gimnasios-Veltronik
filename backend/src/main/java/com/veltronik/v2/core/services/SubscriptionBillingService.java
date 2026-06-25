package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantPayment;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantPaymentRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Escritura transaccional del estado de cobro a partir de los eventos de Mercado Pago.
 *
 * <p>Se separa del WebhookController a propósito: el controller hace la llamada HTTP a
 * MP (red) FUERA de transacción, y delega acá SOLO las escrituras en BD, en una
 * transacción corta. Así no se mantiene abierta una conexión de BD durante la llamada
 * remota a Mercado Pago.</p>
 *
 * <p>Mantiene en sincronía tres cosas que antes quedaban inconsistentes:</p>
 * <ul>
 *   <li>{@code tenant_payment}: historial de cobros del SaaS (idempotente por mpPaymentId).</li>
 *   <li>{@code subscriptions}: estado y período vigente — es lo que lee el Kill Switch.</li>
 *   <li>{@code tenant}: fecha de acceso ({@code trial_ends_at}) y flag activo.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SubscriptionBillingService {

    /** Días de acceso que otorga cada cobro mensual aprobado. */
    private static final int ACCESS_DAYS_PER_CYCLE = 30;
    /** Gracia extra tras el fin de período antes de bloquear (colchón ante demoras de webhook). */
    private static final int GRACE_DAYS = 3;
    /** Zona del negocio (Argentina): el "ahora" debe ser hora AR, no la del server UTC. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    private final TenantRepository tenantRepository;
    private final TenantPaymentRepository tenantPaymentRepository;
    private final SubscriptionRepository subscriptionRepository;

    /**
     * Aplica un cobro APROBADO (alta o renovación de suscripción).
     * Idempotente: si el mpPaymentId ya fue procesado, no hace nada.
     *
     * @return true si se aplicó; false si era duplicado o el tenant no existe.
     */
    @Transactional
    public boolean applyApprovedPayment(UUID tenantId, String mpPaymentId, BigDecimal amount, String mpPreapprovalId) {
        if (mpPaymentId != null && tenantPaymentRepository.existsByMpPaymentId(mpPaymentId)) {
            log.info("Pago {} ya procesado (idempotencia). Ignorado.", mpPaymentId);
            return false;
        }

        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
        if (tenant == null) {
            log.warn("Cobro {} referencia un tenant inexistente {}.", mpPaymentId, tenantId);
            return false;
        }

        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);

        // 1) Registrar el cobro (historial del SaaS).
        TenantPayment payment = new TenantPayment();
        payment.setTenant(tenant);
        payment.setMpPaymentId(mpPaymentId);
        payment.setMpPreapprovalId(mpPreapprovalId);
        payment.setAmount(amount != null ? amount : BigDecimal.ZERO);
        payment.setStatus("APPROVED");
        payment.setPaymentDate(now);
        tenantPaymentRepository.save(payment);

        // 2) Acceso = al menos 30 días desde HOY, sin apilar sobre un período ya vigente igual
        //    o mayor. Así el 1er cobro (~1h) de un alta recién activada NO duplica el período
        //    (la activación ya otorgó 30d); las renovaciones SÍ extienden (al vencer, el período
        //    corriente ≈ hoy → hoy+30d).
        //
        //    Nota de diseño: la FUENTE AUTORITATIVA de "pagó en V2" es la suscripción
        //    (current_period_end, abajo) — así lo evalúa SubscriptionAccessPolicy. Acá
        //    espejamos esa fecha en tenant.trial_ends_at de forma deliberada: es la
        //    "fecha de acceso" que el filtro usa como atajo (evita un query a subscriptions
        //    cuando el negocio está dentro del período) y la que ancla al cron. No es una
        //    confusión trial/pago: la policy distingue ambos por el ORIGEN (suscripción vs trial).
        LocalDateTime candidate = now.plusDays(ACCESS_DAYS_PER_CYCLE);
        LocalDateTime periodEnd = (tenant.getTrialEndsAt() != null && tenant.getTrialEndsAt().isAfter(candidate))
                ? tenant.getTrialEndsAt() : candidate;
        tenant.setTrialEndsAt(periodEnd);
        tenant.setActive(true);
        tenantRepository.save(tenant);

        // 3) Mantener la tabla subscriptions al día (la lee el Kill Switch).
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId)
                .orElseGet(() -> {
                    Subscription s = new Subscription();
                    s.setTenant(tenant);
                    return s;
                });
        sub.setStatus("active");
        sub.setCurrentPeriodStart(now);
        sub.setCurrentPeriodEnd(periodEnd);
        sub.setGracePeriodEndsAt(periodEnd.plusDays(GRACE_DAYS));
        sub.setLastChargeStatus("approved");
        sub.setLastChargeAt(now);
        if (mpPreapprovalId != null) {
            sub.setMpSubscriptionId(mpPreapprovalId);
        }
        subscriptionRepository.save(sub);

        log.info("Cobro {} aplicado al Tenant {} ({}). Acceso hasta {}.",
                mpPaymentId, tenant.getName(), tenantId, periodEnd);
        return true;
    }

    /**
     * Refleja un cambio de estado del preapproval (suscripción) de MP.
     * Mapea el estado de MP al de la tabla subscriptions, que es lo que evalúa el Kill Switch.
     * NO bloquea de inmediato: el acceso corre hasta {@code trial_ends_at}; el cron desactiva
     * cuando vence y no hay suscripción válida.
     */
    @Transactional
    public void updatePreapprovalStatus(UUID tenantId, String mpPreapprovalId, String mpStatus) {
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).orElse(null);
        if (sub == null) {
            log.info("Preapproval {} sin suscripción local para tenant {}; nada que actualizar.",
                    mpPreapprovalId, tenantId);
            return;
        }
        String localStatus = mapPreapprovalStatus(mpStatus);
        sub.setStatus(localStatus);
        if (mpPreapprovalId != null) {
            sub.setMpSubscriptionId(mpPreapprovalId);
        }

        // POLÍTICA RIGUROSA (corporativa): el estado del preapproval (authorized / paused /
        // cancelled) NO otorga acceso por sí mismo. El acceso real (período + is_active) lo da
        // EXCLUSIVAMENTE un cobro APROBADO vía applyApprovedPayment. Acá solo reflejamos el
        // estado de la suscripción; el KillSwitch decide el acceso por el período vigente.

        subscriptionRepository.save(sub);
        log.info("Suscripción del tenant {} actualizada a estado '{}' (MP: '{}').",
                tenantId, sub.getStatus(), mpStatus);
    }

    /**
     * Registra un cobro RECHAZADO: guarda el motivo (status_detail de MP) para que el frontend
     * lo muestre, y NO otorga acceso (el tenant queda sin período vigente → bloqueado).
     */
    @Transactional
    public void recordRejectedCharge(UUID tenantId, String mpPreapprovalId, String statusDetail) {
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).orElse(null);
        if (sub == null) {
            log.info("Cobro rechazado (preapproval {}) sin suscripción local para tenant {}.", mpPreapprovalId, tenantId);
            return;
        }
        sub.setLastChargeStatus("rejected");
        sub.setLastChargeDetail(statusDetail != null ? statusDetail : "rejected");
        sub.setLastChargeAt(LocalDateTime.now(BUSINESS_ZONE));
        if (mpPreapprovalId != null) {
            sub.setMpSubscriptionId(mpPreapprovalId);
        }
        subscriptionRepository.save(sub);
        log.warn("Cobro RECHAZADO para tenant {} (motivo MP: {}). NO se otorga acceso.", tenantId, statusDetail);
    }

    /** Traduce el estado del preapproval de MP al vocabulario interno de subscriptions. */
    private String mapPreapprovalStatus(String mpStatus) {
        if (mpStatus == null) return "pending";
        return switch (mpStatus.toLowerCase()) {
            case "authorized" -> "active";
            case "paused" -> "past_due";
            case "cancelled", "canceled" -> "canceled";
            default -> mpStatus.toLowerCase();
        };
    }
}
