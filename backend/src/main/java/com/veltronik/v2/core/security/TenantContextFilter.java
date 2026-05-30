package com.veltronik.v2.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Extrae el X-Tenant-ID de los headers y lo coloca en el ThreadLocal.
 * Se ejecuta DESPUÉS de que Spring Security validó el JWT de Supabase.
 */
@Component
public class TenantContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        final String tenantHeader = request.getHeader("X-Tenant-ID");

        try {
            if (tenantHeader != null && !tenantHeader.isBlank()) {
                java.util.UUID tenantId = java.util.UUID.fromString(tenantHeader);
                TenantContextHolder.setTenantId(tenantId);
            }
            filterChain.doFilter(request, response);
        } catch (IllegalArgumentException e) {
            // El header no es un UUID válido
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "X-Tenant-ID inválido");
        } finally {
            // EXTREMADAMENTE IMPORTANTE: Limpiar el ThreadLocal
            TenantContextHolder.clear();
        }
    }
}
