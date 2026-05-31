package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class GymTeamService {

    private final TenantMembershipRepository membershipRepository;
    private final AppUserRepository userRepository;
    private final TenantRepository tenantRepository;

    public GymTeamService(TenantMembershipRepository membershipRepository, AppUserRepository userRepository, TenantRepository tenantRepository) {
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
    }

    public List<Map<String, Object>> getTeamMembers() {
        UUID tenantId = TenantContextHolder.getTenantId();

        // UNA sola query (JOIN FETCH): trae las membresías activas + su AppUser ya
        // inicializado. No hace falta @Transactional ni hay riesgo de N+1, y el filtro
        // de "activo" se resuelve en la BD.
        List<TenantMembership> memberships = membershipRepository.findActiveByTenantIdWithUser(tenantId);
        List<Map<String, Object>> result = new ArrayList<>();

        for (TenantMembership membership : memberships) {
            AppUser user = membership.getUser(); // ya cargado por el JOIN FETCH (sin sesión abierta)
            Map<String, Object> map = new HashMap<>();
            map.put("user_id", user.getId());
            map.put("email", user.getEmail());
            map.put("fullName", user.getFirstName() + " " + user.getLastName());
            map.put("role", membership.getRole().name().toLowerCase());
            result.add(map);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> inviteMember(String email, String roleStr) {
        UUID tenantId = TenantContextHolder.getTenantId();
        Tenant tenant = tenantRepository.findById(tenantId).orElseThrow(() -> new RuntimeException("Tenant no encontrado"));

        AppUser user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("El empleado debe tener una cuenta registrada en Veltronik."));

        UserRole role;
        try {
            role = UserRole.valueOf(roleStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new RuntimeException("Rol no válido");
        }

        Optional<TenantMembership> existingOpt = membershipRepository.findByUserIdAndTenantId(user.getId(), tenantId);
        TenantMembership membership;

        if (existingOpt.isPresent()) {
            membership = existingOpt.get();
            if (membership.isActive()) {
                throw new RuntimeException("El usuario ya pertenece a este equipo.");
            }
            // Re-activate
            membership.setActive(true);
            membership.setRole(role);
        } else {
            membership = new TenantMembership();
            membership.setUser(user);
            membership.setTenant(tenant);
            membership.setRole(role);
            membership.setActive(true);
        }

        membershipRepository.save(membership);

        Map<String, Object> map = new HashMap<>();
        map.put("user_id", user.getId());
        map.put("email", user.getEmail());
        map.put("fullName", user.getFirstName() + " " + user.getLastName());
        map.put("role", membership.getRole().name().toLowerCase());
        return map;
    }

    @Transactional
    public Map<String, Object> updateRole(UUID userId, String newRoleStr) {
        UUID tenantId = TenantContextHolder.getTenantId();
        TenantMembership membership = membershipRepository.findByUserIdAndTenantId(userId, tenantId)
                .orElseThrow(() -> new RuntimeException("Miembro no encontrado en este equipo"));

        UserRole role;
        try {
            role = UserRole.valueOf(newRoleStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new RuntimeException("Rol no válido");
        }

        if (membership.getRole() == UserRole.OWNER) {
            throw new RuntimeException("No se puede cambiar el rol del dueño principal.");
        }

        membership.setRole(role);
        membershipRepository.save(membership);

        Map<String, Object> map = new HashMap<>();
        map.put("role", membership.getRole().name().toLowerCase());
        return map;
    }

    @Transactional
    public void removeMember(UUID userId) {
        UUID tenantId = TenantContextHolder.getTenantId();
        TenantMembership membership = membershipRepository.findByUserIdAndTenantId(userId, tenantId)
                .orElseThrow(() -> new RuntimeException("Miembro no encontrado en este equipo"));

        if (membership.getRole() == UserRole.OWNER) {
            throw new RuntimeException("No se puede eliminar al dueño principal.");
        }

        // Logical delete or physical delete.
        // Let's do physical delete or logical? TenantMembership has is_active, so logical.
        membership.setActive(false);
        membershipRepository.save(membership);
    }

    public List<Map<String, Object>> getActivityLog(int limit) {
        // Mock activity log for now since V2 doesn't have an audit table yet
        return new ArrayList<>();
    }
}
