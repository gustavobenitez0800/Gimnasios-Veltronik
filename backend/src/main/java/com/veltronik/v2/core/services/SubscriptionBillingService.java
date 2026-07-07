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

    /** Precio mensual esperado: centinela de cobros por montos anómalos (solo log, no bloquea). */
    @org.springframework.beans.factory.annotation.Value("${veltronik.billing.monthly-price:80000}")
    private BigDecimal monthlyPrice;

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

        // Centinela de ingresos: un cobro aprobado por MENOS del precio mensual no debería
        // existir (el preapproval se crea por el precio completo). Se aplica igual — bloquear
        // acá castigaría un cambio de precio legítimo — pero queda la alarma en los logs.
        if (amount != null && monthlyPrice != null && amount.compareTo(monthlyPrice) < 0) {
            log.warn("Cobro {} del tenant {} por ${} — MENOR al precio mensual (${}). Revisar en MP.",
                    mpPaymentId, tenantId, amount, monthlyPrice);
        }

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
     *
     * <p><b>Guardia anti-pisada:</b> el flujo anti-duplicado cancela en MP los preapprovals
     * viejos, y esos webhooks de cancelación llegan DESPUÉS de que el nuevo ya es la suscripción
     * de registro. Un evento no-autorizante (cancelled/paused) de un preapproval DISTINTO al
     * vigente se ignora: aplicarlo pisaría el estado (y el id) de la suscripción real del
     * cliente. Un 'authorized' siempre se aplica: es un alta nueva que pasa a ser la vigente.</p>
     */
    @Transactional
    public void updatePreapprovalStatus(UUID tenantId, String mpPreapprovalId, String mpStatus) {
        String localStatus = mapPreapprovalStatus(mpStatus);

        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).orElse(null);
        if (sub == null) {
            // Alta por link: el preapproval queda 'authorized' ANTES del primer cobro y todavía
            // no existe registro local. Se crea acá (sin período ni acceso: eso lo da SOLO el
            // cobro aprobado) para que el id quede registrado desde el minuto cero — sin esto,
            // "Cancelar suscripción" o "Verificar con MP" no encontraban qué cancelar/verificar
            // y MP seguía cobrando una suscripción invisible para el sistema.
            if (!"active".equals(localStatus)) {
                log.info("Preapproval {} (estado MP '{}') sin suscripción local para tenant {}; nada que actualizar.",
                        mpPreapprovalId, mpStatus, tenantId);
                return;
            }
            Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
            if (tenant == null) {
                log.warn("Preapproval {} referencia un tenant inexistente {}.", mpPreapprovalId, tenantId);
                return;
            }
            Subscription s = new Subscription();
            s.setTenant(tenant);
            s.setStatus("pending_payment"); // autorizada en MP, esperando el primer cobro
            s.setMpSubscriptionId(mpPreapprovalId);
            subscriptionRepository.save(s);
            log.info("Suscripción local creada (pending_payment) para tenant {} por preapproval {} autorizado.",
                    tenantId, mpPreapprovalId);
            return;
        }

        boolean staleEvent = mpPreapprovalId != null
                && sub.getMpSubscriptionId() != null
                && !mpPreapprovalId.equals(sub.getMpSubscriptionId())
                && !"active".equals(localStatus);
        if (staleEvent) {
            log.info("Evento '{}' del preapproval {} IGNORADO: la suscripción vigente del tenant {} es {}.",
                    mpStatus, mpPreapprovalId, tenantId, sub.getMpSubscriptionId());
            return;
        }

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
     *
     * <p><b>Guardia anti-pisada:</b> un rechazo de un preapproval DISTINTO al vigente es un
     * evento rezagado de una suscripción vieja (ya cancelada por el anti-duplicado). Aplicarlo
     * marcaría 'rejected' sobre la suscripción nueva — el cliente que reintentó con otra
     * tarjeta vería "rechazado" mientras su cobro real sigue procesándose.</p>
     */
    @Transactional
    public void recordRejectedCharge(UUID tenantId, String mpPreapprovalId, String statusDetail) {
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).orElse(null);
        if (sub == null) {
            log.info("Cobro rechazado (preapproval {}) sin suscripción local para tenant {}.", mpPreapprovalId, tenantId);
            return;
        }
        if (mpPreapprovalId != null && sub.getMpSubscriptionId() != null
                && !mpPreapprovalId.equals(sub.getMpSubscriptionId())) {
            log.info("Cobro rechazado del preapproval {} IGNORADO: la suscripción vigente del tenant {} es {}.",
                    mpPreapprovalId, tenantId, sub.getMpSubscriptionId());
            return;
        }
        sub.setLastChargeStatus("rejected");
        sub.setLastChargeDetail(statusDetail != null ? statusDetail : "rejected");
        sub.setLastChargeAt(LocalDateTime.now(BUSINESS_ZONE));
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
