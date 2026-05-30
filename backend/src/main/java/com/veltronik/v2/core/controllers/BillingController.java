package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.BillingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class BillingController {

    @Autowired
    private BillingService billingService;

    @Autowired
    private TenantRepository tenantRepository;

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
            String link = billingService.createSubscriptionLink(tenant);
            return ResponseEntity.ok(Map.of("init_point", link));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Error creating subscription: " + e.getMessage());
        }
    }


}
