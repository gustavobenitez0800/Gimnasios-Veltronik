package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.services.DeviceRegistryService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

/**
 * Autenticación de EQUIPOS para el sync headless (ladrillo 4, ADR-010).
 *
 * <p>El sync corre sin humanos logueados, así que {@code /api/sync/**} no usa JWT:
 * autentica con {@code X-Device-Id} + {@code X-Device-Key} contra el hash emitido en el
 * bautizo. <b>Fail-closed</b>: cualquier request a /api/sync/** sin credencial válida
 * muere acá con 401 (la ruta es permitAll a nivel Spring Security justamente porque
 * ESTE filtro es la puerta).</p>
 *
 * <p>Con credencial válida, setea el tenant (el de enrolamiento — jamás un header del
 * cliente) y el DNI en los ThreadLocals, como si fuera una request de usuario normal.</p>
 */
@Component
@RequiredArgsConstructor
public class DeviceCredentialFilter extends OncePerRequestFilter {

    private final DeviceRegistryService deviceRegistryService;

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/sync/");
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        final UUID deviceId = parseUuid(request.getHeader("X-Device-Id"));
        final String deviceKey = request.getHeader("X-Device-Key");

        Optional<Device> device = deviceRegistryService.authenticate(deviceId, deviceKey);
        if (device.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"error\":\"DEVICE_UNAUTHORIZED\",\"message\":\"Credencial de equipo inválida o revocada.\"}");
            return;
        }

        try {
            // El tenant sale del ENROLAMIENTO, nunca de un header del cliente.
            TenantContextHolder.setTenantId(device.get().getEnrolledTenantId());
            DeviceContextHolder.setDeviceId(device.get().getId());
            filterChain.doFilter(request, response);
        } finally {
            TenantContextHolder.clear();
            DeviceContextHolder.clear();
        }
    }

    private UUID parseUuid(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
