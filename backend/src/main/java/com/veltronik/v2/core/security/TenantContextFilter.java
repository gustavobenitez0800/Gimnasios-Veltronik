package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.DeviceStatus;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.DeviceRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Profile;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.UUID;

/**
 * Extrae el X-Tenant-ID de los headers, VERIFICA que el usuario autenticado
 * pertenezca (activo) a ese tenant, y recién entonces lo coloca en el ThreadLocal.
 *
 * Se ejecuta DESPUÉS de que Spring Security validó el JWT de Supabase, por lo que
 * el usuario ya está disponible en el SecurityContext.
 *
 * <p><b>SEGURIDAD CRÍTICA (Mandamiento #3 — Aislamiento):</b> el header X-Tenant-ID
 * lo envía el frontend desde localStorage, es decir, es un dato bajo control total
 * del cliente. Sin validar la pertenencia, cualquier usuario autenticado podría
 * operar sobre los datos de otro negocio simplemente cambiando el header. Por eso
 * acá se valida contra {@code tenant_membership} ANTES de habilitar el contexto;
 * de lo contrario el filtro de Hibernate filtraría por el tenant equivocado.</p>
 */
// Solo nube: en modo local el tenant sale del token de sesión (LocalSessionFilter), no de
// un header. Además, gatearlo evita que Spring Boot lo auto-registre como servlet filter
// en el cerebro local (los @Component OncePerRequestFilter corren fuera de la cadena).
@Profile("!local")
@Component
public class TenantContextFilter extends OncePerRequestFilter {

    private final TenantMembershipRepository membershipRepository;
    private final MembershipCache membershipCache;
    private final DeviceRepository deviceRepository;
    private final DeviceBindingCache deviceBindingCache;

    public TenantContextFilter(TenantMembershipRepository membershipRepository,
                               MembershipCache membershipCache,
                               DeviceRepository deviceRepository,
                               DeviceBindingCache deviceBindingCache) {
        this.membershipRepository = membershipRepository;
        this.membershipCache = membershipCache;
        this.deviceRepository = deviceRepository;
        this.deviceBindingCache = deviceBindingCache;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        final String tenantHeader = request.getHeader("X-Tenant-ID");

        try {
            if (tenantHeader != null && !tenantHeader.isBlank()) {

                final UUID tenantId;
                try {
                    tenantId = UUID.fromString(tenantHeader);
                } catch (IllegalArgumentException e) {
                    writeError(response, HttpServletResponse.SC_BAD_REQUEST,
                            "INVALID_TENANT", "X-Tenant-ID inválido");
                    return;
                }

                // El usuario debe estar autenticado y ser miembro ACTIVO del tenant solicitado.
                // PERF: el veredicto positivo se cachea 60s (MembershipCache) — sin la caché,
                // CADA request pagaba una query a la BD remota antes de tocar el endpoint.
                final UUID userId = SecurityUtils.getCurrentUserId();
                UserRole role = (userId == null) ? null : membershipCache.getRole(userId, tenantId);
                if (role == null && userId != null) {
                    final TenantMembership membership = membershipRepository
                            .findByUserIdAndTenantIdAndActiveTrue(userId, tenantId).orElse(null);
                    if (membership != null) {
                        role = membership.getRole();
                        membershipCache.put(userId, tenantId, role);
                    }
                }
                if (role == null) {
                    writeError(response, HttpServletResponse.SC_FORBIDDEN,
                            "FORBIDDEN_TENANT", "No tiene acceso a este negocio.");
                    return;
                }

                // Segunda llave: un equipo ENROLADO queda atado a SU sucursal (Fase 3).
                if (!isAllowedOnThisDevice(request, tenantId, role)) {
                    writeError(response, HttpServletResponse.SC_FORBIDDEN,
                            "DEVICE_BOUND_TO_OTHER_TENANT",
                            "Este equipo pertenece a otra sucursal.");
                    return;
                }

                TenantContextHolder.setTenantId(tenantId);
                // Inyecta el rol (de tenant_membership) como authority de Spring para que el
                // control de acceso por método (@PreAuthorize) pueda bloquear endpoints sensibles
                // (reportes, billing, equipo) a STAFF/RECEPTION. El rol es POR tenant, por eso se
                // resuelve acá —con el tenant ya validado— y no en el JWT de Supabase.
                injectRoleAuthority(role);
            }

            filterChain.doFilter(request, response);

        } finally {
            // EXTREMADAMENTE IMPORTANTE: limpiar el ThreadLocal pase lo que pase.
            TenantContextHolder.clear();
        }
    }

    /**
     * ¿Puede este EQUIPO operar la sucursal pedida? (Fase 3 — la segunda identidad)
     *
     * <p>La primera llave —la membresía, arriba— dice qué sucursales puede tocar la
     * PERSONA. Esta dice cuál puede tocar la MÁQUINA. El terminal del mostrador de una
     * sucursal se enrola una vez y queda atado a ella: un empleado que además es miembro
     * de otra sucursal no puede abrirla desde ahí, ni por error ni a propósito. La
     * sucursal deja de ser algo que el cliente elige y manda en un header.</p>
     *
     * <p><b>El OWNER queda exento.</b> Es el dueño de todas sus sucursales y necesita
     * poder mirarlas desde donde esté; encerrarlo en el terminal donde se sentó sería
     * romperle la herramienta. Para todos los demás roles la atadura es dura.</p>
     *
     * <p><b>Falla ABIERTA a propósito</b>, al revés que el chequeo de membresía. Este es
     * un control SECUNDARIO: si la consulta a la BD se cae, el usuario igual quedó
     * limitado a las sucursales donde es miembro —la garantía fuerte ya se aplicó— así
     * que dejar pasar acá acota el daño a "un empleado ve una sucursal suya desde el
     * terminal equivocado", mientras que fallar cerrado dejaría un gimnasio entero sin
     * poder trabajar por un blip de red.</p>
     *
     * <p>El {@code X-Device-Id} se lee del header y no de {@link DeviceContextHolder}
     * porque {@code DeviceContextFilter} es un filtro de servlet auto-registrado: corre
     * DESPUÉS de toda la cadena de Spring Security, así que en este punto el ThreadLocal
     * todavía está vacío.</p>
     */
    private boolean isAllowedOnThisDevice(HttpServletRequest request, UUID tenantId, UserRole role) {
        if (role == UserRole.OWNER) return true;

        final UUID deviceId = parseUuid(request.getHeader("X-Device-Id"));
        if (deviceId == null) return true; // sin DNI no hay atadura que verificar

        try {
            DeviceBindingCache.Binding cached = deviceBindingCache.get(deviceId);
            if (cached == null) {
                UUID enrolled = deviceRepository.findById(deviceId)
                        .filter(d -> d.getStatus() == DeviceStatus.ACTIVE)
                        .map(Device::getEnrolledTenantId)
                        .orElse(null);
                deviceBindingCache.put(deviceId, enrolled);
                cached = new DeviceBindingCache.Binding(enrolled);
            }

            // Equipo sin enrolar (el caso de todo navegador web): nada que atar.
            if (!cached.isBound()) return true;

            return tenantId.equals(cached.tenantId());
        } catch (Exception e) {
            logger.warn("No se pudo verificar la atadura del equipo " + deviceId + ": " + e.getMessage());
            return true; // ver "falla ABIERTA" arriba
        }
    }

    /** Parseo tolerante: un header ausente o malformado es "sin DNI", no un error. */
    private UUID parseUuid(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Agrega {@code ROLE_<rol>} a las authorities del usuario para esta request, de modo que
     * {@code hasRole(...)} / {@code hasAnyRole(...)} en {@code @PreAuthorize} funcione. Falla
     * cerrado: si no se pudiera inyectar, el usuario queda sin rol y los endpoints protegidos
     * lo rechazan (403) — nunca al revés.
     */
    private void injectRoleAuthority(UserRole role) {
        if (role == null) return;
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (!(current instanceof JwtAuthenticationToken jwtAuth)) return;
        ArrayList<GrantedAuthority> authorities = new ArrayList<>(jwtAuth.getAuthorities());
        authorities.add(new SimpleGrantedAuthority("ROLE_" + role.name()));
        JwtAuthenticationToken updated =
                new JwtAuthenticationToken(jwtAuth.getToken(), authorities, jwtAuth.getName());
        SecurityContextHolder.getContext().setAuthentication(updated);
    }

    private void writeError(HttpServletResponse response, int status, String error, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\":\"" + error + "\",\"message\":\"" + message + "\"}");
    }
}
