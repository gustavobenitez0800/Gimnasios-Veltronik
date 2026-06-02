package com.veltronik.v2.core.services;

import com.mercadopago.client.preapproval.PreApprovalAutoRecurringCreateRequest;
import com.mercadopago.client.preapproval.PreapprovalClient;
import com.mercadopago.client.preapproval.PreapprovalCreateRequest;
import com.mercadopago.client.preapproval.PreapprovalUpdateRequest;
import com.mercadopago.resources.preapproval.Preapproval;
import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Servicio de facturación: genera los links de suscripción de MercadoPago.
 *
 * NOTA: MercadoPagoConfig.setAccessToken() se inicializa UNA SOLA VEZ en
 * {@link com.veltronik.v2.core.config.MercadoPagoConfiguration} via @PostConstruct.
 * NO inicializar el token acá para evitar race conditions con múltiples @PostConstruct.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class BillingService {

    @Value("${veltronik.billing.monthly-price:80000}")
    private BigDecimal monthlyPrice;

    @Value("${cors.frontend-url:https://veltronik.com}")
    private String frontendUrl;

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionBillingService subscriptionBillingService;
    private final MercadoPagoService mercadoPagoService;

    @Transactional
    public String createSubscriptionLink(Tenant tenant, String payerEmail) throws Exception {
        log.info("Generando link de suscripción para Tenant '{}' ({}), pagador: {}",
                tenant.getName(), tenant.getId(), payerEmail);

        PreapprovalClient client = new PreapprovalClient();

        PreApprovalAutoRecurringCreateRequest autoRecurring = PreApprovalAutoRecurringCreateRequest.builder()
                .frequency(1)
                .frequencyType("months")
                .transactionAmount(monthlyPrice)
                .currencyId("ARS")
                .build();

        PreapprovalCreateRequest request = PreapprovalCreateRequest.builder()
                .reason("Suscripción Veltronik V2 - " + tenant.getName())
                .autoRecurring(autoRecurring)
                .backUrl(frontendUrl + "/payment-callback")
                .externalReference(tenant.getId().toString())
                .payerEmail(payerEmail)
                .build();

        try {
            Preapproval preapproval = client.create(request);
            log.info("Link de suscripción creado para Tenant '{}': {}", tenant.getName(), preapproval.getId());
            return preapproval.getInitPoint();
        } catch (com.mercadopago.exceptions.MPApiException apiEx) {
            // El detalle real de MP NO está en getMessage(), sino en la respuesta de la API.
            // Sin esto, el error queda como un genérico inútil y no se puede diagnosticar.
            String detail = apiEx.getApiResponse() != null ? apiEx.getApiResponse().getContent() : "(sin cuerpo)";
            log.error("Mercado Pago RECHAZÓ la suscripción del Tenant '{}'. HTTP {} — Detalle: {}",
                    tenant.getName(), apiEx.getStatusCode(), detail);
            throw new RuntimeException("Mercado Pago rechazó la solicitud (HTTP " + apiEx.getStatusCode() + "): " + detail, apiEx);
        }
    }

    /**
     * Cobro "poné la tarjeta y listo": crea la suscripción cobrando una tarjeta tokenizada
     * (sin redirección ni login de MP), reactiva el acceso y guarda el email del pagador.
     *
     * <p>No es {@code @Transactional} a propósito: la llamada de red a MP se hace FUERA de
     * transacción; la escritura local se delega a {@code updatePreapprovalStatus} (que abre su
     * propia transacción corta).</p>
     */
    public Map<String, Object> subscribeWithCard(Tenant tenant, String payerEmail, String cardToken) {
        // 1) Crear la suscripción en MP con la tarjeta tokenizada. NO otorga acceso todavía.
        MercadoPagoService.CardSubscriptionResult pre = mercadoPagoService.createCardSubscription(tenant, payerEmail, cardToken);

        // 2) Persistir la suscripción local como PENDING_PAYMENT (esperando el primer cobro).
        //    SIN período ni is_active: el acceso lo otorga EXCLUSIVAMENTE el cobro aprobado (webhook).
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenant.getId())
                .orElseGet(() -> {
                    Subscription s = new Subscription();
                    s.setTenant(tenant);
                    return s;
                });
        sub.setStatus("pending_payment");
        sub.setMpPayerEmail(payerEmail);
        sub.setMpSubscriptionId(pre.preapprovalId());
        sub.setLastChargeStatus(null);   // arranca un ciclo de cobro nuevo
        sub.setLastChargeDetail(null);
        subscriptionRepository.save(sub);

        log.info("Suscripción con tarjeta creada (PENDING_PAYMENT) Tenant '{}': preapproval={}, statusMP={}. Espera cobro.",
                tenant.getName(), pre.preapprovalId(), pre.status());
        return Map.of("ok", true, "state", "processing");
    }

    /**
     * Estado de facturación del tenant para el polling del frontend (UX por estados).
     * state: processing (esperando el cobro) · active (cobro OK, acceso vigente) ·
     *        rejected (último cobro rechazado, con motivo) · none (sin suscripción).
     */
    public Map<String, Object> getBillingStatus(Tenant tenant) {
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenant.getId()).orElse(null);
        java.time.LocalDateTime now = java.time.LocalDateTime.now(java.time.ZoneId.of("America/Argentina/Buenos_Aires"));

        String state;
        if (sub == null) {
            state = "none";
        } else if ("active".equals(sub.getStatus())
                && sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isAfter(now)) {
            state = "active";
        } else if ("rejected".equalsIgnoreCase(sub.getLastChargeStatus())) {
            state = "rejected";
        } else {
            state = "processing";
        }

        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("state", state);
        result.put("detail", sub != null ? sub.getLastChargeDetail() : null);
        result.put("periodEnd", sub != null && sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd().toString() : null);
        result.put("payerEmail", sub != null ? sub.getMpPayerEmail() : null);
        return result;
    }

    /**
     * Verifica el estado real de la suscripción contra Mercado Pago y lo sincroniza
     * localmente. Útil cuando el webhook no llegó (reconciliación manual desde Ajustes).
     *
     * @return {changed: boolean, message: String} — changed=true si el estado local cambió.
     */
    @Transactional
    public Map<String, Object> verifySubscription(Tenant tenant) throws Exception {
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenant.getId()).orElse(null);
        if (sub == null || sub.getMpSubscriptionId() == null || sub.getMpSubscriptionId().isBlank()) {
            return Map.of("changed", false, "message", "No hay una suscripción de Mercado Pago para verificar.");
        }

        PreapprovalClient client = new PreapprovalClient();
        Preapproval pre = client.get(sub.getMpSubscriptionId());
        String mpStatus = pre.getStatus();
        String prevLocalStatus = sub.getStatus();

        // Sincroniza el estado local con MP (mapea authorized→active, etc.).
        subscriptionBillingService.updatePreapprovalStatus(tenant.getId(), sub.getMpSubscriptionId(), mpStatus);

        Subscription refreshed = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenant.getId()).orElse(sub);
        boolean changed = !java.util.Objects.equals(prevLocalStatus, refreshed.getStatus());
        log.info("Verify subscription Tenant '{}': MP={}, local {}→{}", tenant.getName(), mpStatus, prevLocalStatus, refreshed.getStatus());
        return Map.of(
                "changed", changed,
                "message", "Estado en Mercado Pago: " + mpStatus
        );
    }

    /**
     * Cancela la suscripción en Mercado Pago (status=cancelled) y refleja el cambio
     * local. El acceso continúa hasta el fin del período ya pagado (lo evalúa el KillSwitch).
     */
    @Transactional
    public void cancelSubscription(Tenant tenant) throws Exception {
        Subscription sub = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenant.getId()).orElse(null);
        if (sub == null) {
            throw new IllegalStateException("No hay suscripción para cancelar.");
        }

        // Cancelar en Mercado Pago si hay preapproval vinculado (best-effort: si MP falla,
        // igual marcamos local para no dejar al usuario sin poder cancelar).
        if (sub.getMpSubscriptionId() != null && !sub.getMpSubscriptionId().isBlank()) {
            try {
                PreapprovalClient client = new PreapprovalClient();
                client.update(sub.getMpSubscriptionId(),
                        PreapprovalUpdateRequest.builder().status("cancelled").build());
                log.info("Preapproval {} cancelado en MP para Tenant '{}'", sub.getMpSubscriptionId(), tenant.getName());
            } catch (Exception e) {
                log.error("No se pudo cancelar el preapproval en MP (se marca local igual): {}", e.getMessage());
            }
        }

        subscriptionBillingService.updatePreapprovalStatus(tenant.getId(), sub.getMpSubscriptionId(), "cancelled");
    }
}
