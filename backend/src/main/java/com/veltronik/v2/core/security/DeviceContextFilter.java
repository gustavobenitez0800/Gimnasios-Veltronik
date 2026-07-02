package com.veltronik.v2.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Extrae el header {@code X-Device-Id} (el "DNI de equipo", ADR-002) y lo deja en
 * {@link DeviceContextHolder} para que {@code TenantAwareEntity} lo estampe en cada
 * inserción ({@code origin_device_id}).
 *
 * <p><b>Deliberadamente laxo</b> — a diferencia de {@code TenantContextFilter}, acá un
 * header ausente o malformado NO es error: la procedencia es telemetría/trazabilidad,
 * no seguridad. Requests sin DNI (web, webhooks de MP, jobs) simplemente insertan con
 * {@code origin_device_id = null}. Nunca se rechaza una operación por esto — la regla
 * "nunca perder una venta" (ADR-003) manda.</p>
 */
@Component
public class DeviceContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        try {
            final String header = request.getHeader("X-Device-Id");
            if (header != null && !header.isBlank()) {
                try {
                    DeviceContextHolder.setDeviceId(UUID.fromString(header.trim()));
                } catch (IllegalArgumentException ignored) {
                    // Header malformado → se ignora (procedencia desconocida ≠ operación inválida).
                }
            }

            filterChain.doFilter(request, response);

        } finally {
            // Igual que TenantContextHolder: limpiar el ThreadLocal pase lo que pase.
            DeviceContextHolder.clear();
        }
    }
}
