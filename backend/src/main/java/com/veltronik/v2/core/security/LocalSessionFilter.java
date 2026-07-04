package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.sync.SyncIdentity;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * La puerta del modo local (ladrillo 6): valida el token de sesión del cajero
 * ({@code Authorization: Bearer <token>}), y si es válido deja el SecurityContext, el
 * tenant y el DNI de equipo listos — el equivalente offline del filtro de JWT de Supabase.
 *
 * <p><b>Mapeo de roles</b> (según lo que exigen los controllers): {@code CAJERO → ROLE_STAFF}
 * (opera el POS: vende, abre/cierra caja) y {@code ENCARGADO → ROLE_ADMIN} (además anula
 * ventas, gestiona catálogo, ajusta stock). Un cajero jamás llega a los endpoints
 * {@code hasAnyRole('OWNER','ADMIN')} — que es lo correcto.</p>
 *
 * <p><b>Procedencia:</b> setea {@code DeviceContextHolder} con el DNI de ESTE equipo
 * (de la identidad de sync), para que las ventas creadas localmente lleven su
 * {@code origin_device_id} y suban etiquetadas.</p>
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class LocalSessionFilter extends OncePerRequestFilter {

    private final LocalSessionService localSessionService;
    private final SyncIdentity syncIdentity;

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        // El sync tiene su propia puerta (DeviceCredentialFilter); no lo tocamos.
        return request.getRequestURI().startsWith("/api/sync/");
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        Optional<LocalPrincipal> principal = bearer(request).flatMap(localSessionService::verify);
        boolean authenticated = principal.isPresent();

        try {
            if (authenticated) {
                LocalPrincipal p = principal.get();
                TenantContextHolder.setTenantId(p.tenantId());
                deviceId().ifPresent(DeviceContextHolder::setDeviceId);

                var auth = new UsernamePasswordAuthenticationToken(p, null, authorities(p.role()));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
            filterChain.doFilter(request, response);
        } finally {
            if (authenticated) {
                TenantContextHolder.clear();
                DeviceContextHolder.clear();
                SecurityContextHolder.clearContext();
            }
        }
    }

    private Optional<String> bearer(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return Optional.of(header.substring(7).trim());
        }
        return Optional.empty();
    }

    /** El DNI de ESTE equipo (de la identidad de sync), para estampar origin_device_id. */
    private Optional<java.util.UUID> deviceId() {
        return syncIdentity.resolve().map(id -> {
            try {
                return java.util.UUID.fromString(id.deviceId());
            } catch (IllegalArgumentException e) {
                return null;
            }
        });
    }

    private List<GrantedAuthority> authorities(Cashier.Role role) {
        String mapped = role == Cashier.Role.ENCARGADO ? "ROLE_ADMIN" : "ROLE_STAFF";
        return List.of(new SimpleGrantedAuthority(mapped), new SimpleGrantedAuthority("ROLE_" + role.name()));
    }
}
