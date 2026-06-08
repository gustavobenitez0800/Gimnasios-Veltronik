package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.repositories.AccessLogRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class GymTeamService {

    private final TenantMembershipRepository membershipRepository;
    private final AppUserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final AccessLogRepository accessLogRepository;
    private final GymPaymentRepository paymentRepository;
    private final GymMemberRepository memberRepository;

    public GymTeamService(TenantMembershipRepository membershipRepository, AppUserRepository userRepository,
                          TenantRepository tenantRepository, AccessLogRepository accessLogRepository,
                          GymPaymentRepository paymentRepository, GymMemberRepository memberRepository) {
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
        this.accessLogRepository = accessLogRepository;
        this.paymentRepository = paymentRepository;
        this.memberRepository = memberRepository;
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
            map.put("fullName", buildDisplayName(user));
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

    /**
     * Feed de actividad reciente del negocio. V2 no tiene una tabla de auditoría dedicada, así
     * que lo componemos a partir de los datos reales que YA se generan: accesos (check-ins),
     * pagos y altas de socios. Se mezclan y ordenan por fecha descendente.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getActivityLog(int limit) {
        UUID tenantId = TenantContextHolder.getTenantId();
        List<Map<String, Object>> items = new ArrayList<>();

        // Accesos / check-ins
        for (AccessLog a : accessLogRepository.findTop25ByTenantIdOrderByCheckInAtDesc(tenantId)) {
            items.add(activityItem("access", memberName(a.getMember()), "registró un ingreso", "Acceso", a.getCheckInAt()));
        }
        // Pagos (la query ya viene ordenada desc con el socio cargado)
        paymentRepository.findByTenantId(tenantId).stream().limit(25).forEach(p ->
            items.add(activityItem("payment", memberName(p.getMember()), "registró un pago", "Pago", p.getPaymentDate()))
        );
        // Altas de socios
        for (GymMember m : memberRepository.findTop25ByTenantIdOrderByCreatedAtDesc(tenantId)) {
            items.add(activityItem("member", memberName(m), "se registró como socio", "Socio", m.getCreatedAt()));
        }

        // Ordenar por fecha descendente (nulos al final)
        items.sort((x, y) -> {
            LocalDateTime tx = (LocalDateTime) x.get("created_at");
            LocalDateTime ty = (LocalDateTime) y.get("created_at");
            if (tx == null && ty == null) return 0;
            if (tx == null) return 1;
            if (ty == null) return -1;
            return ty.compareTo(tx);
        });

        int max = Math.max(0, Math.min(limit, items.size()));
        return new ArrayList<>(items.subList(0, max));
    }

    private Map<String, Object> activityItem(String type, String userName, String action, String entityType, LocalDateTime ts) {
        Map<String, Object> map = new HashMap<>();
        map.put("type", type);
        map.put("user_name", userName);
        map.put("action", action);
        map.put("entity_type", entityType);
        map.put("created_at", ts);
        return map;
    }

    /** Nombre del socio para el feed; "Mostrador" si el pago no tiene socio (venta suelta). */
    private String memberName(GymMember m) {
        if (m == null) return "Mostrador";
        String fn = m.getFirstName() != null ? m.getFirstName().trim() : "";
        String ln = m.getLastName() != null ? m.getLastName().trim() : "";
        String full = (fn + " " + ln).trim();
        return full.isEmpty() ? "Socio" : full;
    }

    /**
     * Nombre para mostrar, tolerante a nulos. Evita el literal "null null" cuando el
     * AppUser fue creado/migrado solo con email (sin first/last name).
     * Orden de preferencia: "Nombre Apellido" → parte local del email → "Usuario sin nombre".
     */
    private String buildDisplayName(AppUser user) {
        String fn = user.getFirstName() != null ? user.getFirstName().trim() : "";
        String ln = user.getLastName() != null ? user.getLastName().trim() : "";
        String full = (fn + " " + ln).trim();
        if (!full.isEmpty()) {
            return full;
        }
        String email = user.getEmail();
        if (email != null && email.contains("@")) {
            return email.substring(0, email.indexOf('@'));
        }
        return "Usuario sin nombre";
    }
}
