package com.veltronik.v2.core.services;

import com.mercadopago.client.preapproval.PreApprovalAutoRecurringCreateRequest;
import com.mercadopago.client.preapproval.PreapprovalClient;
import com.mercadopago.client.preapproval.PreapprovalCreateRequest;
import com.mercadopago.resources.preapproval.Preapproval;
import com.veltronik.v2.core.entities.Tenant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * Servicio de facturación: genera los links de suscripción de MercadoPago.
 *
 * NOTA: MercadoPagoConfig.setAccessToken() se inicializa UNA SOLA VEZ en
 * {@link com.veltronik.v2.core.config.MercadoPagoConfiguration} via @PostConstruct.
 * NO inicializar el token acá para evitar race conditions con múltiples @PostConstruct.
 */
@Service
@Slf4j
public class BillingService {

    @Value("${veltronik.billing.monthly-price:80000}")
    private BigDecimal monthlyPrice;

    @Value("${cors.frontend-url:https://veltronik.com}")
    private String frontendUrl;

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
}
