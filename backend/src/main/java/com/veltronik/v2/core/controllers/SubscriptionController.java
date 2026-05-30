package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.MercadoPagoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/core/subscriptions")
@RequiredArgsConstructor
@Slf4j
public class SubscriptionController {

    private final MercadoPagoService mercadoPagoService;
    private final TenantRepository tenantRepository;

    @PostMapping("/checkout")
    public ResponseEntity<?> createCheckout() {
        // En un entorno Cero Error, tomamos el Tenant del contexto de seguridad, 
        // no confiamos en IDs enviados desde el frontend.
        java.util.UUID tenantId = TenantContextHolder.getTenantId();
        
        if (tenantId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "No se detectó un gimnasio en la sesión."));
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new RuntimeException("Gimnasio no encontrado"));

        String userEmail = SecurityContextHolder.getContext().getAuthentication().getName();

        try {
            String initPoint = mercadoPagoService.createSubscriptionForTenant(tenant, userEmail);
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "init_point", initPoint
            ));
        } catch (Exception e) {
            log.error("Fallo al crear checkout: ", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Fallo al comunicar con Mercado Pago"));
        }
    }
}
