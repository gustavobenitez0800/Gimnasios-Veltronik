package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.SubscriptionDTO;
import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.mappers.SubscriptionMapper;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/tenants")
@RequiredArgsConstructor
public class TenantSubscriptionController {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionMapper subscriptionMapper;
    private final TenantMembershipRepository membershipRepository;

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

    /**
     * BATCH para el Lobby: la última suscripción de CADA negocio del usuario, en UNA
     * sola llamada. Antes el Lobby hacía 1 request por negocio (cada una con su propio
     * overhead de JWT + validación de membresía + queries de filtros) — con varias
     * sucursales, el lobby tardaba visiblemente en mostrar los estados de pago.
     *
     * <p><b>Seguridad:</b> el alcance lo definen las membresías ACTIVAS del usuario
     * autenticado (tenant_membership) — no hay ids controlados por el cliente.</p>
     */
    @GetMapping("/my/subscriptions")
    public ResponseEntity<List<SubscriptionDTO>> getMySubscriptions() {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No autenticado");
        }

        List<UUID> tenantIds = membershipRepository.findByUserId(userId).stream()
                .filter(TenantMembership::isActive)
                .map(m -> m.getTenant().getId())
                .toList();
        if (tenantIds.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }

        // El request del Lobby puede traer un X-Tenant-ID viejo en el header → el filtro de
        // Hibernate recortaría la consulta a UN solo tenant. Esta consulta es multi-tenant
        // POR DISEÑO (y segura: los ids salen de las membresías del usuario), así que se
        // suspende el contexto solo durante la query y se restaura al salir.
        UUID previousContext = TenantContextHolder.getTenantId();
        TenantContextHolder.clear();
        List<Subscription> subs;
        try {
            subs = subscriptionRepository.findByTenantIdIn(tenantIds);
        } finally {
            if (previousContext != null) {
                TenantContextHolder.setTenantId(previousContext);
            }
        }

        // Quedarse con la suscripción MÁS RECIENTE por tenant (mismo criterio que
        // findFirstByTenantIdOrderByCreatedAtDesc del endpoint individual).
        Map<UUID, Subscription> latestByTenant = new HashMap<>();
        for (Subscription s : subs) {
            UUID tid = s.getTenant().getId();
            Subscription current = latestByTenant.get(tid);
            if (current == null || (s.getCreatedAt() != null && current.getCreatedAt() != null
                    && s.getCreatedAt().isAfter(current.getCreatedAt()))) {
                latestByTenant.put(tid, s);
            }
        }

        return ResponseEntity.ok(latestByTenant.values().stream()
                .map(subscriptionMapper::toDto)
                .toList());
    }
}
