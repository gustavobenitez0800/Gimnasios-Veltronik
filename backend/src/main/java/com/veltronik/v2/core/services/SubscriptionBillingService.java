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

        // 2) Extender el acceso: desde el vencimiento vigente si aún no expiró, o desde hoy.
        LocalDateTime base = (tenant.getTrialEndsAt() != null && tenant.getTrialEndsAt().isAfter(now))
                ? tenant.getTrialEndsAt() : now;
        LocalDateTime periodEnd = base.plusDays(ACCESS_DAYS_PER_CYCLE);
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

        // CRÍTICO: si el preapproval quedó AUTORIZADO/activo, esto es un alta o reactivación
        // efectiva → hay que EXTENDER el período y reactivar el tenant. Antes esto solo
        // cambiaba el status string: la suscripción quedaba 'active' pero con
        // currentPeriodEnd vencido y tenant.is_active sin tocar → el cliente pagaba y NO
        // se reactivaba (el KillSwitch valida el período real, no solo el status).
        if ("active".equals(localStatus)) {
            LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
            LocalDateTime base = (sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isAfter(now))
                    ? sub.getCurrentPeriodEnd() : now;
            LocalDateTime periodEnd = base.plusDays(ACCESS_DAYS_PER_CYCLE);
            sub.setCurrentPeriodStart(now);
            sub.setCurrentPeriodEnd(periodEnd);
            sub.setGracePeriodEndsAt(periodEnd.plusDays(GRACE_DAYS));

            Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
            if (tenant != null) {
                tenant.setTrialEndsAt(periodEnd);
                tenant.setActive(true);
                tenantRepository.save(tenant);
            }
            log.info("Preapproval AUTORIZADO: tenant {} reactivado, acceso hasta {}.", tenantId, periodEnd);
        }

        subscriptionRepository.save(sub);
        log.info("Suscripción del tenant {} actualizada a estado '{}' (MP: '{}').",
                tenantId, sub.getStatus(), mpStatus);
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
