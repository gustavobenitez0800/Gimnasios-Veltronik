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

    @PostMapping("/tenant")
    @Transactional
    public ResponseEntity<?> createTenant(@RequestBody TenantDTO tenantDTO) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) {
            return ResponseEntity.status(401).body("No autorizado");
        }

        String userEmail = auth.getName();
        AppUser user = userRepository.findByEmail(userEmail).orElse(null);
        if (user == null) {
            return ResponseEntity.status(404).body("Usuario no encontrado");
        }

        // Determinar si es su primera sucursal (mes gratis) o no
        List<TenantMembership> existingMemberships = membershipRepository.findByUserId(user.getId());
        boolean isFirstBranch = existingMemberships.isEmpty();

        Tenant tenant = tenantMapper.toEntity(tenantDTO);
        tenant.setActive(true);

        if (isFirstBranch) {
            // Primera sucursal: 30 días de prueba
            tenant.setTrialEndsAt(LocalDateTime.now().plusDays(30));
        } else {
            // Sucursal adicional: Vencido de inmediato (debe pagar para usar)
            tenant.setTrialEndsAt(LocalDateTime.now().minusMinutes(1));
            // Opcionalmente podemos poner setActive(false) o dejar que el Kill Switch lo ataje por el trialEndsAt
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
