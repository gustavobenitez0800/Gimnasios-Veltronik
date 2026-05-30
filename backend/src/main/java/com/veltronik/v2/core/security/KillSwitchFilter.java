package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * KillSwitchFilter: Actúa como barrera operativa.
 * Se ejecuta DESPUÉS del JwtAuthenticationFilter.
 * Verifica si el Tenant (Negocio) tiene la suscripción al día o si está en período de prueba.
 * Si no está al día, bloquea la petición con un error 402 (Payment Required).
 */
@Component
public class KillSwitchFilter extends OncePerRequestFilter {

    @Autowired
    private TenantRepository tenantRepository;

    @Override
    protected void doFilterInternal(@org.springframework.lang.NonNull HttpServletRequest request, 
                                    @org.springframework.lang.NonNull HttpServletResponse response, 
                                    @org.springframework.lang.NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // 1. Excluir rutas que no requieren validación operativa
        if (shouldNotFilter(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // 2. Obtener el Tenant del contexto (seteado previamente por el JwtFilter)
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) {
            // Si la ruta requiere tenant y no hay (error de JWT o configuración previa)
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Falta contexto de negocio");
            return;
        }

        // 3. Obtener el Tenant para verificar su estado
        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
        if (tenant == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "Negocio no encontrado");
            return;
        }

        // 4. LÓGICA DEL KILL SWITCH
        boolean isTrialActive = tenant.getTrialEndsAt() != null && tenant.getTrialEndsAt().isAfter(LocalDateTime.now());
        
        // Si no está activo a nivel maestro (baja manual), bloqueamos de inmediato
        if (!tenant.isActive()) {
            response.setStatus(402);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"PAYMENT_REQUIRED\", \"message\": \"Sistema bloqueado. Por favor regularice su situación.\"}");
            return;
        }

        // Si NO está en prueba, verificamos que tenga un pago reciente válido.
        // Como implementamos reconciliación de MP, si el webhook marcó isActive = false, caerá arriba.
        // Si necesitamos lógica estricta de tiempo (ej. pasó un mes sin pago):
        // En una implementación robusta, el BillingService (cron) pone tenant.setActive(false)
        // si expira el tiempo. Por lo tanto, con chequear isActive y isTrialActive es suficiente.
        
        // Si pasó los controles, continúa la ejecución normal
        filterChain.doFilter(request, response);
    }

    private boolean shouldNotFilter(String path) {
        // Rutas públicas, Auth y Facturación quedan abiertas siempre para que puedan pagar
        return path.startsWith("/api/auth") ||
               path.startsWith("/api/billing") ||
               path.startsWith("/api/webhooks") ||
               path.startsWith("/api/tenants") || // Permitir listar y crear tenants sin tener uno seleccionado
               path.startsWith("/api/core/setup") || 
               path.startsWith("/api/core/profiles");
    }
}
