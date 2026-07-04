package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
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
 *
 * <p>La DECISIÓN de acceso NO vive acá: la delega en {@link SubscriptionAccessPolicy}, la
 * fuente única de verdad que comparte con el cron. Este filtro solo aporta la plomería
 * (contexto de tenant, caché de veredictos, respuesta 402) y la persistencia de la baja.</p>
 *
 * <p><b>Solo en la nube ({@code @Profile("!local")}):</b> la facturación es un asunto de la
 * nube. El cerebro local jamás bloquea una venta por pago (ADR-003, "nunca perder una venta").
 * Además, al ser un {@code @Component}, Spring Boot lo auto-registra como servlet filter fuera
 * de la cadena de seguridad — sin este gate, correría igual en modo local y bloquearía todo.</p>
 */
@Profile("!local")
@Component
@RequiredArgsConstructor
@Slf4j
public class KillSwitchFilter extends OncePerRequestFilter {

    /** Zona del negocio (Argentina): el "ahora" debe ser hora AR, no la del server UTC. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    /**
     * PERF: caché de veredictos PERMITIDOS (tenant → vencimiento del veredicto, 30 s).
     * Sin esto, CADA request pagaba 2 queries a la BD remota (tenant + suscripción) antes
     * de llegar al endpoint. Solo se cachea el ALLOW: un tenant bloqueado siempre golpea
     * la BD, así el desbloqueo tras un pago es INMEDIATO; el caso inverso (venció hace
     * segundos) se tolera ≤30 s — el cobro no corre riesgo.
     */
    private static final long ALLOW_TTL_MS = 30_000;
    private final java.util.concurrent.ConcurrentHashMap<UUID, Long> allowCache =
            new java.util.concurrent.ConcurrentHashMap<>();

    private final TenantRepository tenantRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionAccessPolicy accessPolicy;

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

        // 2b. Veredicto positivo cacheado y vigente → pasar sin tocar la BD.
        Long allowedUntil = allowCache.get(tenantId);
        if (allowedUntil != null) {
            if (System.currentTimeMillis() < allowedUntil) {
                filterChain.doFilter(request, response);
                return;
            }
            allowCache.remove(tenantId);
        }

        // 3. Obtener el Tenant para verificar su estado
        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);
        if (tenant == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "Negocio no encontrado");
            return;
        }

        // 4. DECISIÓN DE ACCESO (tiempo real, delegada en la fuente única de verdad).
        //
        // Antes la regla estaba duplicada acá y en el cron, y divergían. Ahora ambos usan
        // SubscriptionAccessPolicy. La evaluación es por-request, así que no dependemos del
        // cron de las 00:05: un período vencido se bloquea al instante.
        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);

        // Optimización: el trial vigente se resuelve con datos del propio tenant. Solo si NO
        // hay trial vigente (y el tenant sigue activo a nivel maestro) pagamos el query de la
        // suscripción. Así un negocio en prueba no golpea la tabla subscriptions.
        boolean onTrial = tenant.getTrialEndsAt() != null && tenant.getTrialEndsAt().isAfter(now);
        Subscription latest = (tenant.isActive() && !onTrial)
                ? subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).orElse(null)
                : null;

        SubscriptionAccessPolicy.Decision decision = accessPolicy.evaluate(tenant, latest, now);

        if (decision.allowed()) {
            // Veredicto positivo verificado contra la BD → cachearlo 30 s (solo el ALLOW).
            allowCache.put(tenantId, System.currentTimeMillis() + ALLOW_TTL_MS);
            filterChain.doFilter(request, response);
            return;
        }

        // Bloqueo. Si el negocio venía ACTIVO a nivel maestro y el bloqueo es por VENCIMIENTO
        // (no una baja manual), persistimos is_active=false para que la bandera maestra refleje
        // la realidad al instante, sin esperar al cron. Fail-safe: si la escritura falla, se
        // bloquea igual (la seguridad no depende de la persistencia).
        if (decision.reason() == SubscriptionAccessPolicy.Reason.NO_VALID_ENTITLEMENT && tenant.isActive()) {
            try {
                tenant.setActive(false);
                tenantRepository.save(tenant);
                log.warn("KILL SWITCH (tiempo real) — Negocio '{}' ({}) bloqueado: sin habilitación vigente.",
                        tenant.getName(), tenant.getId());
            } catch (Exception e) {
                log.warn("No se pudo persistir la baja del tenant {} (se bloquea igual): {}", tenantId, e.getMessage());
            }
        }
        blockPaymentRequired(response);
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
               path.startsWith("/api/public") ||        // reservas online: sin X-Tenant-ID (el service resuelve el tenant por token)
               path.startsWith("/api/tenants") || // Permitir listar y crear tenants sin tener uno seleccionado
               path.startsWith("/api/core/setup") ||
               path.startsWith("/api/core/subscriptions") || // checkout/suscripción: el moroso debe poder pagar
               path.startsWith("/api/core/profiles") ||
               path.startsWith("/api/updates") ||  // el updater pregunta por credencial de equipo (sin tenant)
               path.startsWith("/api/hq");          // Mission Control del fundador: global, cross-tenant
    }
}
