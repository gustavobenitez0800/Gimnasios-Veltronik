package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.mappers.TenantMapper;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/core/setup")
public class SetupController {

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private TenantMembershipRepository membershipRepository;

    @Autowired
    private AppUserRepository userRepository;

    @Autowired
    private TenantMapper tenantMapper;

    /** Días de prueba de la primera sucursal. Configurable (application.properties / env TRIAL_DAYS). */
    @org.springframework.beans.factory.annotation.Value("${veltronik.billing.trial-days:14}")
    private int trialDays;

    /** Zona del negocio (Argentina): el trial se calcula en hora AR, no la del server. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    @PostMapping("/tenant")
    @Transactional
    public ResponseEntity<?> createTenant(@RequestBody TenantDTO tenantDTO) {
        java.util.UUID userId = com.veltronik.v2.core.security.SecurityUtils.getCurrentUserId();
        if (userId == null) {
            return ResponseEntity.status(401).body("No autorizado");
        }

        AppUser user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.status(404).body("Usuario no encontrado");
        }

        // Determinar si es su primera sucursal (mes gratis) o no
        List<TenantMembership> existingMemberships = membershipRepository.findByUserId(user.getId());
        boolean isFirstBranch = existingMemberships.isEmpty();

        Tenant tenant = tenantMapper.toEntity(tenantDTO);
        tenant.setActive(true);

        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        if (isFirstBranch) {
            // Primera sucursal: período de prueba configurable (por defecto 14 días).
            tenant.setTrialEndsAt(now.plusDays(trialDays));
        } else {
            // Sucursal adicional: NO tiene período de prueba → trialEndsAt = null.
            // El Kill Switch la bloquea (sin trial ni suscripción) hasta que se active con un
            // pago. Antes se ponía now-1min, pero el lobby lo leía como "prueba finalizada"
            // (engañoso: la sucursal adicional NUNCA tuvo prueba).
            tenant.setTrialEndsAt(null);
        }

        Tenant savedTenant = tenantRepository.save(tenant);

        // Crear la membresía como OWNER
        TenantMembership membership = new TenantMembership();
        membership.setUser(user);
        membership.setTenant(savedTenant);
        membership.setRole(UserRole.OWNER);
        membership.setActive(true);
        membershipRepository.save(membership);

        return ResponseEntity.ok(Map.of(
            "message", "Negocio creado exitosamente",
            "is_first_branch", isFirstBranch,
            "tenant_id", savedTenant.getId(),
            "trial_ends_at", savedTenant.getTrialEndsAt()
        ));
    }
}
