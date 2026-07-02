package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.BillingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor // inyección por constructor (regla ArchitectureTest: sin @Autowired en campos)
@PreAuthorize("hasAnyRole('OWNER','ADMIN')") // gestión de la suscripción del SaaS: dueño/admin (no STAFF/RECEPTION)
public class BillingController {

    private final BillingService billingService;
    private final TenantRepository tenantRepository;

    @GetMapping("/billing/subscription-link")
    public ResponseEntity<?> getSubscriptionLink() {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) {
            return ResponseEntity.badRequest().body("No tenant context");
        }

        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
        if (tenant == null) {
            return ResponseEntity.badRequest().body("Tenant not found");
        }

        try {
            String link = billingService.createSubscriptionLink(tenant, SecurityUtils.getCurrentUserEmail());
            return ResponseEntity.ok(Map.of("init_point", link));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Error creating subscription: " + e.getMessage());
        }
    }

    /**
     * Cambiar método de pago: genera un nuevo link de suscripción de MP. El frontend
     * (Ajustes / muro de bloqueo) redirige al init_point. Tenant tomado del contexto
     * de seguridad (no del body — Cero Error). Respuesta: {data:{init_point}}.
     */
    @PostMapping("/update-payment-method")
    public ResponseEntity<?> updatePaymentMethod() {
        Tenant tenant = currentTenant();
        if (tenant == null) return ResponseEntity.badRequest().body(Map.of("error", "No hay gimnasio en la sesión."));
        try {
            String link = billingService.createSubscriptionLink(tenant, SecurityUtils.getCurrentUserEmail());
            return ResponseEntity.ok(Map.of("data", Map.of("init_point", link)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "No se pudo generar el link de pago: " + e.getMessage()));
        }
    }

    /** Verifica/sincroniza el estado de la suscripción contra MP. Respuesta: {changed, message}. */
    @PostMapping("/verify-subscription")
    public ResponseEntity<?> verifySubscription() {
        Tenant tenant = currentTenant();
        if (tenant == null) return ResponseEntity.badRequest().body(Map.of("error", "No hay gimnasio en la sesión."));
        try {
            return ResponseEntity.ok(billingService.verifySubscription(tenant));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "No se pudo verificar con Mercado Pago: " + e.getMessage()));
        }
    }

    /** Cancela la suscripción en MP. El acceso sigue hasta el fin del período pagado. */
    @PostMapping("/cancel-subscription")
    public ResponseEntity<?> cancelSubscription() {
        Tenant tenant = currentTenant();
        if (tenant == null) return ResponseEntity.badRequest().body(Map.of("error", "No hay gimnasio en la sesión."));
        try {
            billingService.cancelSubscription(tenant);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "No se pudo cancelar la suscripción: " + e.getMessage()));
        }
    }

    /**
     * Cobro con TARJETA TOKENIZADA (Card Payment Brick). El front manda el {@code card_token}
     * (MP tokenizó la tarjeta del lado del cliente) y el {@code payer_email}; acá se crea la
     * suscripción autorizada SIN redirección ni login de MP. Tenant del contexto, nunca del body.
     * Va bajo /api/billing a propósito: el KillSwitch deja pasar esa ruta aun con el tenant bloqueado.
     */
    @PostMapping("/billing/subscribe-card")
    public ResponseEntity<?> subscribeWithCard(@RequestBody Map<String, String> body) {
        Tenant tenant = currentTenant();
        if (tenant == null) return ResponseEntity.badRequest().body(Map.of("error", "No hay gimnasio en la sesión."));

        String cardToken = body.get("card_token");
        if (cardToken == null || cardToken.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Falta el token de la tarjeta."));

        String payerEmail = body.get("payer_email");
        if (payerEmail == null || payerEmail.isBlank()) payerEmail = SecurityUtils.getCurrentUserEmail();

        try {
            return ResponseEntity.ok(billingService.subscribeWithCard(tenant, payerEmail, cardToken));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "No se pudo procesar el pago: " + e.getMessage()));
        }
    }

    /**
     * Estado de facturación del tenant en curso (lo pollea la UX de pago para mostrar cada paso).
     * Bajo /api/billing → el KillSwitch lo deja pasar aun con el tenant bloqueado.
     */
    @GetMapping("/billing/status")
    public ResponseEntity<?> billingStatus() {
        Tenant tenant = currentTenant();
        if (tenant == null) return ResponseEntity.badRequest().body(Map.of("error", "No hay gimnasio en la sesión."));
        return ResponseEntity.ok(billingService.getBillingStatus(tenant));
    }

    /** Tenant del contexto de seguridad (seteado por el JwtFilter), nunca del body. */
    private Tenant currentTenant() {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) return null;
        return tenantRepository.findById(tenantId).orElse(null);
    }
}
