package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.security.MembershipCache;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.SupabaseAdminService;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
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
    private final MembershipCache membershipCache;
    /** Para crear la cuenta del empleado sin que se registre él (ver {@link #inviteMember}). */
    private final SupabaseAdminService supabaseAdminService;

    public GymTeamService(TenantMembershipRepository membershipRepository, AppUserRepository userRepository,
                          TenantRepository tenantRepository, AccessLogRepository accessLogRepository,
                          GymPaymentRepository paymentRepository, GymMemberRepository memberRepository,
                          MembershipCache membershipCache,
                          SupabaseAdminService supabaseAdminService) {
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
        this.accessLogRepository = accessLogRepository;
        this.paymentRepository = paymentRepository;
        this.memberRepository = memberRepository;
        this.membershipCache = membershipCache;
        this.supabaseAdminService = supabaseAdminService;
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
    /**
     * Suma a alguien al equipo. Si no tiene cuenta, se la CREA.
     *
     * <p><b>Por qué cambió.</b> Antes esto exigía que el empleado se registrara solo: el
     * dueño tenía que decirle "entrá a esta web, creá una cuenta y después decime qué
     * email usaste". Con la rotación que tiene un mostrador, ese baile se repite todo el
     * tiempo — y el botón "Invitar" no invitaba nada, solo vinculaba cuentas existentes.</p>
     *
     * <p>Ahora el dueño escribe nombre, email y rol, y listo. Si la persona YA tenía cuenta
     * (porque trabaja en otra sucursal, por ejemplo), se vincula la que hay en vez de
     * crear una nueva.</p>
     *
     * <p><b>La contraseña temporal viaja UNA sola vez</b>, en la respuesta de esta llamada
     * — mismo criterio que la credencial de equipo. No queda guardada en ningún lado
     * legible: el dueño la copia y se la pasa a la persona.</p>
     *
     * @param fullName nombre para mostrar; solo se usa si hay que crear la cuenta
     */
    public Map<String, Object> inviteMember(String email, String roleStr, String fullName) {
        UUID tenantId = TenantContextHolder.getTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant no encontrado"));

        if (email == null || email.isBlank()) {
            throw new BusinessException("Poné el email del empleado.");
        }
        final String emailLimpio = email.trim().toLowerCase();

        UserRole role = parseAssignableRole(roleStr);

        String temporaryPassword = null;
        Optional<AppUser> existente = userRepository.findByEmail(emailLimpio);
        AppUser user;

        if (existente.isPresent()) {
            user = existente.get();
        } else if (supabaseAdminService.isAvailable()) {
            // No tiene cuenta: se la creamos. La fila de app_user la crea sola el trigger
            // on_auth_user_created (V11) al insertarse el usuario en Supabase.
            SupabaseAdminService.CreatedUser creado = supabaseAdminService.createUser(emailLimpio, fullName);
            temporaryPassword = creado.temporaryPassword();
            user = esperarUsuarioCreado(emailLimpio, creado.userId());
        } else {
            // Sin credencial de servicio configurada: se mantiene el comportamiento viejo
            // en vez de romper. El mensaje dice qué hacer.
            throw new BusinessException("El empleado debe tener una cuenta registrada en Veltronik.");
        }

        Optional<TenantMembership> existingOpt = membershipRepository.findByUserIdAndTenantId(user.getId(), tenantId);
        TenantMembership membership;

        if (existingOpt.isPresent()) {
            membership = existingOpt.get();
            if (membership.isActive()) {
                throw new BusinessException("El usuario ya pertenece a este equipo.");
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
        map.put("fullName", (safe(user.getFirstName()) + " " + safe(user.getLastName())).trim());
        map.put("role", membership.getRole().name().toLowerCase());
        // Presente SOLO cuando se acaba de crear la cuenta. Viaja una única vez: no queda
        // guardada en ningún lado legible, así que si el dueño no la copia, hay que
        // resetearla. El frontend la muestra con un aviso de eso.
        map.put("temporaryPassword", temporaryPassword);
        map.put("accountCreated", temporaryPassword != null);
        return map;
    }

    private static String safe(String value) {
        return value != null ? value : "";
    }

    /**
     * Espera a que aparezca la fila de {@code app_user} del usuario recién creado.
     *
     * <p>La crea un trigger de base de datos cuando Supabase inserta en {@code auth.users},
     * no nuestro código. En la práctica ya está lista cuando la API responde, pero son dos
     * caminos distintos hacia la misma base y no hay garantía de orden: sin este reintento,
     * un alta podría fallar por milisegundos y el dueño vería un error con la cuenta ya
     * creada — el peor de los dos mundos, porque reintentar le diría "ese email ya existe".</p>
     */
    private AppUser esperarUsuarioCreado(String email, UUID userId) {
        for (int intento = 0; intento < 5; intento++) {
            Optional<AppUser> encontrado = userRepository.findByEmail(email);
            if (encontrado.isPresent()) return encontrado.get();
            Optional<AppUser> porId = userRepository.findById(userId);
            if (porId.isPresent()) return porId.get();
            try {
                Thread.sleep(200L * (intento + 1));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        throw new BusinessException(
                "La cuenta se creó, pero todavía no está disponible. Esperá unos segundos y agregala por su email.");
    }

    @Transactional
    public Map<String, Object> updateRole(UUID userId, String newRoleStr) {
        UUID tenantId = TenantContextHolder.getTenantId();
        TenantMembership membership = membershipRepository.findByUserIdAndTenantId(userId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Miembro no encontrado en este equipo"));

        UserRole role = parseAssignableRole(newRoleStr);

        if (membership.getRole() == UserRole.OWNER) {
            throw new BusinessException("No se puede cambiar el rol del dueño principal.");
        }

        membership.setRole(role);
        membershipRepository.save(membership);
        // El rol vive cacheado 60s en el filtro de seguridad → invalidar para que aplique YA.
        membershipCache.evict(userId, tenantId);

        Map<String, Object> map = new HashMap<>();
        map.put("role", membership.getRole().name().toLowerCase());
        return map;
    }

    @Transactional
    public void removeMember(UUID userId) {
        UUID tenantId = TenantContextHolder.getTenantId();
        TenantMembership membership = membershipRepository.findByUserIdAndTenantId(userId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Miembro no encontrado en este equipo"));

        if (membership.getRole() == UserRole.OWNER) {
            throw new BusinessException("No se puede eliminar al dueño principal.");
        }

        // Logical delete or physical delete.
        // Let's do physical delete or logical? TenantMembership has is_active, so logical.
        membership.setActive(false);
        membershipRepository.save(membership);
        // Sin esta invalidación, el removido conservaría acceso hasta 60s (TTL de la caché).
        membershipCache.evict(userId, tenantId);
    }

    /**
     * Parsea y valida un rol ASIGNABLE por la gestión de equipo.
     *
     * <p><b>SEGURIDAD (escalación de privilegios):</b> OWNER queda explícitamente prohibido.
     * El rol de dueño solo lo crea el sistema al fundar el negocio (SetupController); si un
     * ADMIN pudiera invitar/promover a alguien como OWNER, ese miembro quedaría irremovible
     * (updateRole/removeMember protegen al OWNER) y con poder de borrar el negocio entero.</p>
     */
    private UserRole parseAssignableRole(String roleStr) {
        UserRole role;
        try {
            role = UserRole.valueOf(roleStr.toUpperCase());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException("Rol no válido");
        }
        if (role == UserRole.OWNER) {
            throw new BusinessException("El rol de dueño no se puede asignar desde la gestión de equipo.");
        }
        return role;
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
        // Pagos: límite en la BD (traer el historial entero para cortar a 25 en memoria no escala)
        paymentRepository.findRecentByTenantId(tenantId, org.springframework.data.domain.PageRequest.of(0, 25)).forEach(p ->
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
