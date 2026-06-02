package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
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
import java.time.ZoneId;
import java.util.UUID;

/**
 * KillSwitchFilter: Actúa como barrera operativa.
 * Se ejecuta DESPUÉS del JwtAuthenticationFilter.
 * Verifica si el Tenant (Negocio) tiene la suscripción al día o si está en período de prueba.
 * Si no está al día, bloquea la petición con un error 402 (Payment Required).
 */
@Component
public class KillSwitchFilter extends OncePerRequestFilter {

    /** Zona del negocio (Argentina): el "ahora" debe ser hora AR, no la del server UTC. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

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

        // 4. LÓGICA DEL KILL SWITCH (validación en TIEMPO REAL — no depende del cron diario)
        //
        // Antes esto solo miraba tenant.isActive() y delegaba el vencimiento al cron de
        // las 00:05. Problema: entre el vencimiento y el cron (hasta ~24h), o si el cron
        // no marcaba bien (subs 'active' con período vencido), el tenant seguía entrando.
        // Ahora evaluamos el acceso real en cada request.
        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);

        // 4a. Baja manual a nivel maestro → bloqueo inmediato.
        if (!tenant.isActive()) {
            blockPaymentRequired(response);
            return;
        }

        // 4b. Acceso válido = trial vigente O suscripción válida (período no vencido).
        boolean trialActive = tenant.getTrialEndsAt() != null && tenant.getTrialEndsAt().isAfter(now);
        if (trialActive || hasValidSubscription(tenantId, now)) {
            filterChain.doFilter(request, response);
            return;
        }

        // 4c. Activo a nivel maestro pero sin trial ni suscripción vigente → venció. Bloqueo.
        blockPaymentRequired(response);
    }

    /**
     * ¿El tenant tiene una suscripción que le da acceso AHORA? Replica exactamente el
     * criterio del cron ({@code TenantRepository.findExpiredActiveTenants}) para que las
     * dos capas de defensa nunca se contradigan:
     *  - active: solo si el período no venció (currentPeriodEnd > now, o null si recién creada);
     *  - past_due: dentro del período de gracia;
     *  - canceled: el período pago en curso aún no terminó.
     */
    private boolean hasValidSubscription(UUID tenantId, LocalDateTime now) {
        Subscription s = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).orElse(null);
        if (s == null || s.getStatus() == null) return false;
        return switch (s.getStatus()) {
            case "active" -> s.getCurrentPeriodEnd() != null && s.getCurrentPeriodEnd().isAfter(now);
            case "past_due" -> s.getGracePeriodEndsAt() != null && s.getGracePeriodEndsAt().isAfter(now);
            case "canceled" -> s.getCurrentPeriodEnd() != null && s.getCurrentPeriodEnd().isAfter(now);
            default -> false;
        };
    }

    private void blockPaymentRequired(HttpServletResponse response) throws IOException {
        response.setStatus(402);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\": \"PAYMENT_REQUIRED\", \"message\": \"Sistema bloqueado. Por favor regularice su situación.\"}");
    }

    private boolean shouldNotFilter(String path) {
        // Rutas públicas, Auth, Facturación y monitoreo quedan abiertas siempre.
        // CRÍTICO: las rutas de pago/suscripción DEBEN quedar abiertas, si no un tenant
        // vencido (bloqueado con 402) no podría generar el link de pago para regularizar
        // → quedaría en deadlock (bloqueado y sin forma de desbloquearse).
        return path.startsWith("/actuator") ||          // Health/info: Railway lo chequea SIN contexto de tenant
               path.startsWith("/api/auth") ||
               path.startsWith("/api/billing") ||
               path.startsWith("/api/webhooks") ||
               path.startsWith("/api/tenants") || // Permitir listar y crear tenants sin tener uno seleccionado
               path.startsWith("/api/core/setup") ||
               path.startsWith("/api/core/subscriptions") || // checkout/suscripción: el moroso debe poder pagar
               path.startsWith("/api/core/profiles");
    }
}
