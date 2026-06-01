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

    @Transactional
    public String createSubscriptionLink(Tenant tenant) throws Exception {
        log.info("Generando link de suscripción para Tenant '{}' ({})", tenant.getName(), tenant.getId());

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
                .build();

        Preapproval preapproval = client.create(request);
        log.info("Link de suscripción creado para Tenant '{}': {}", tenant.getName(), preapproval.getId());

        return preapproval.getInitPoint();
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
