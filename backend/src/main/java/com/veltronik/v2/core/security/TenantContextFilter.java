package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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
@Component
public class TenantContextFilter extends OncePerRequestFilter {

    private final TenantMembershipRepository membershipRepository;

    public TenantContextFilter(TenantMembershipRepository membershipRepository) {
        this.membershipRepository = membershipRepository;
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
                final UUID userId = SecurityUtils.getCurrentUserId();
                final TenantMembership membership = (userId == null) ? null
                        : membershipRepository.findByUserIdAndTenantIdAndActiveTrue(userId, tenantId).orElse(null);
                if (membership == null) {
                    writeError(response, HttpServletResponse.SC_FORBIDDEN,
                            "FORBIDDEN_TENANT", "No tiene acceso a este negocio.");
                    return;
                }

                TenantContextHolder.setTenantId(tenantId);
                // Inyecta el rol (de tenant_membership) como authority de Spring para que el
                // control de acceso por método (@PreAuthorize) pueda bloquear endpoints sensibles
                // (reportes, billing, equipo) a STAFF/RECEPTION. El rol es POR tenant, por eso se
                // resuelve acá —con el tenant ya validado— y no en el JWT de Supabase.
                injectRoleAuthority(membership.getRole());
            }

            filterChain.doFilter(request, response);

        } finally {
            // EXTREMADAMENTE IMPORTANTE: limpiar el ThreadLocal pase lo que pase.
            TenantContextHolder.clear();
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
