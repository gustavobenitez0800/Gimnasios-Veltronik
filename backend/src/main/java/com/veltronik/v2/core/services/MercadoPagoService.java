package com.veltronik.v2.core.services;

import com.mercadopago.client.preapproval.PreapprovalClient;
import com.mercadopago.client.preapproval.PreapprovalCreateRequest;
import com.mercadopago.client.preapproval.PreApprovalAutoRecurringCreateRequest;
import com.mercadopago.resources.preapproval.Preapproval;
import com.veltronik.v2.core.entities.Tenant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Servicio de integración con Mercado Pago para crear links de suscripción.
 *
 * NOTA IMPORTANTE: MercadoPagoConfig.setAccessToken() se inicializa UNA SOLA
 * VEZ en
 * {@link com.veltronik.v2.core.config.MercadoPagoConfiguration}
 * via @PostConstruct.
 * No repetir aquí para evitar race conditions.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MercadoPagoService {

    @Value("${veltronik.billing.monthly-price:80000}")
    private BigDecimal subscriptionPrice;

    @Value("${cors.frontend-url:https://veltronik.com}")
    private String frontendUrl;

    /**
     * Crea un enlace de suscripción (Preapproval) mensual para la sucursal.
     * Cero Margen de Error: Usamos el ID del Tenant como external_reference para
     * no perder jamás la trazabilidad del pago.
     */
    public String createSubscriptionForTenant(Tenant tenant, String payerEmail) {
        try {
            PreapprovalClient client = new PreapprovalClient();

            // Configuración de cobro automático mensual
            PreApprovalAutoRecurringCreateRequest autoRecurring = PreApprovalAutoRecurringCreateRequest.builder()
                    .frequency(1)
                    .frequencyType("months")
                    .transactionAmount(subscriptionPrice)
                    .currencyId("ARS")
                    .build();

            // NO se setea .status("authorized"): eso exige un card_token (tarjeta ya
            // capturada) y MP devuelve 500 si se autoriza sin medio de pago. Generamos
            // el link en estado pendiente; el cliente carga la tarjeta en el checkout de MP.
            PreapprovalCreateRequest request = PreapprovalCreateRequest.builder()
                    .reason("Suscripción Veltronik V2 - " + tenant.getName())
                    .externalReference(tenant.getId().toString())
                    .payerEmail(payerEmail)
                    .autoRecurring(autoRecurring)
                    .backUrl(frontendUrl + "/payment-callback")
                    .build();

            Preapproval preapproval = client.create(request);

            log.info("Suscripción generada en Mercado Pago para Tenant '{}' ({}): preapprovalId={}",
                    tenant.getName(), tenant.getId(), preapproval.getId());
            return preapproval.getInitPoint();

        } catch (com.mercadopago.exceptions.MPApiException apiEx) {
            // El detalle real de MP NO está en getMessage(), sino en la respuesta de la API.
            String detail = apiEx.getApiResponse() != null ? apiEx.getApiResponse().getContent() : "(sin cuerpo)";
            log.error("Mercado Pago RECHAZÓ la suscripción del Tenant '{}'. HTTP {} — Detalle: {}",
                    tenant.getId(), apiEx.getStatusCode(), detail);
            throw new RuntimeException("Mercado Pago rechazó la solicitud (HTTP " + apiEx.getStatusCode() + "): " + detail, apiEx);
        } catch (Exception e) {
            log.error("Error crítico al crear suscripción en Mercado Pago para Tenant '{}'", tenant.getId(), e);
            throw new RuntimeException("Fallo en la pasarela de pagos al generar suscripción.", e);
        }
    }
}
