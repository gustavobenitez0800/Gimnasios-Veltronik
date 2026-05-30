package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.SubscriptionDTO;
import com.veltronik.v2.core.mappers.SubscriptionMapper;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/tenants")
@RequiredArgsConstructor
public class TenantSubscriptionController {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionMapper subscriptionMapper;

    @GetMapping("/{id}/subscription")
    public ResponseEntity<SubscriptionDTO> getTenantSubscription(@PathVariable("id") UUID tenantId) {
        // Protección IDOR: solo el propio tenant puede consultar su suscripción
        UUID currentTenantId = TenantContextHolder.getTenantId();
        if (currentTenantId == null || !currentTenantId.equals(tenantId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tiene acceso a esta suscripción");
        }

        return subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId)
                .map(subscriptionMapper::toDto)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }
}
