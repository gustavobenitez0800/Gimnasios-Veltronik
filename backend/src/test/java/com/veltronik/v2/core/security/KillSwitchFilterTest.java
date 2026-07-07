package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests de la PLOMERÍA del Kill Switch (doFilterInternal): contexto de tenant, caché de
 * veredictos, respuesta 402, exclusión de rutas y persistencia de la baja. La DECISIÓN de
 * acceso la toma {@link SubscriptionAccessPolicy} (su matriz se cubre en
 * {@code SubscriptionAccessPolicyTest}); acá se inyecta la policy REAL (vía {@code @Spy})
 * para verificar el cableado end-to-end del filtro.
 */
@ExtendWith(MockitoExtension.class)
class KillSwitchFilterTest {

    /** Misma zona que usa el filtro: el "ahora" del negocio es hora Argentina. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    @Mock
    private TenantRepository tenantRepository;
    @Mock
    private SubscriptionRepository subscriptionRepository;
    @Mock
    private FilterChain chain;
    @Spy
    private SubscriptionAccessPolicy accessPolicy = new SubscriptionAccessPolicy();

    @InjectMocks
    private KillSwitchFilter filter;

    private final UUID tenantId = UUID.randomUUID();
    private final LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);

    private Tenant tenant;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(tenantId);
        // Tenant activo a nivel maestro, sin trial: el acceso depende SOLO de la suscripción.
        tenant = new Tenant();
        tenant.setId(tenantId);
        tenant.setActive(true);
        tenant.setTrialEndsAt(null);

        request = new MockHttpServletRequest("GET", "/api/gym/members");
        response = new MockHttpServletResponse();
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private void givenTenantExists() {
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
    }

    private void givenSubscription(String status, LocalDateTime periodEnd, LocalDateTime graceEndsAt) {
        Subscription s = new Subscription();
        s.setStatus(status);
        s.setCurrentPeriodEnd(periodEnd);
        s.setGracePeriodEndsAt(graceEndsAt);
        when(subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId))
                .thenReturn(Optional.of(s));
    }

    private void assertBlocked402() throws Exception {
        assertEquals(402, response.getStatus());
        assertTrue(response.getContentAsString().contains("PAYMENT_REQUIRED"));
        verify(chain, never()).doFilter(any(), any());
    }

    private void assertAllowed() throws Exception {
        verify(chain).doFilter(request, response);
        assertEquals(200, response.getStatus());
    }

    // ─────────────────────────── status: active ───────────────────────────

    @Test
    @DisplayName("active con período vigente → pasa")
    void activeWithCurrentPeriodAllows() throws Exception {
        givenTenantExists();
        givenSubscription("active", now.plusDays(10), now.plusDays(13));

        filter.doFilterInternal(request, response, chain);

        assertAllowed();
    }

    @Test
    @DisplayName("active con período vencido pero gracia vigente → pasa (esperando la renovación de MP)")
    void activeWithExpiredPeriodWithinGraceAllows() throws Exception {
        // MP renueva por mes calendario (28-31 días) y el acceso dura 30 fijos: la gracia
        // cubre la costura para no bloquear al cliente ANTES de que MP intente el cobro.
        givenTenantExists();
        givenSubscription("active", now.minusDays(2), now.plusDays(1));

        filter.doFilterInternal(request, response, chain);

        assertAllowed();
    }

    @Test
    @DisplayName("active con período Y gracia vencidos → 402 (no espera al cron)")
    void activeWithExpiredPeriodAndGraceBlocks() throws Exception {
        givenTenantExists();
        givenSubscription("active", now.minusDays(6), now.minusDays(3));

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
    }

    // ─────────────────────────── status: past_due ───────────────────────────

    @Test
    @DisplayName("past_due dentro del período de gracia → pasa")
    void pastDueWithinGraceAllows() throws Exception {
        givenTenantExists();
        givenSubscription("past_due", now.minusDays(2), now.plusDays(1));

        filter.doFilterInternal(request, response, chain);

        assertAllowed();
    }

    @Test
    @DisplayName("past_due con la gracia agotada → 402")
    void pastDueAfterGraceBlocks() throws Exception {
        givenTenantExists();
        givenSubscription("past_due", now.minusDays(5), now.minusDays(2));

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
    }

    // ─────────────────────────── status: canceled ───────────────────────────

    @Test
    @DisplayName("canceled con período pago aún vigente → pasa (ya pagó ese mes)")
    void canceledWithCurrentPeriodAllows() throws Exception {
        givenTenantExists();
        givenSubscription("canceled", now.plusDays(7), null);

        filter.doFilterInternal(request, response, chain);

        assertAllowed();
    }

    @Test
    @DisplayName("canceled con período terminado → 402")
    void canceledWithExpiredPeriodBlocks() throws Exception {
        givenTenantExists();
        givenSubscription("canceled", now.minusDays(1), null);

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
    }

    // ─────────────────────────── otros estados ───────────────────────────

    @Test
    @DisplayName("estado desconocido (pending) → 402")
    void unknownStatusBlocks() throws Exception {
        givenTenantExists();
        givenSubscription("pending", now.plusDays(30), now.plusDays(33));

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
    }

    @Test
    @DisplayName("sin suscripción y sin trial → 402")
    void noSubscriptionNoTrialBlocks() throws Exception {
        givenTenantExists();
        when(subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId))
                .thenReturn(Optional.empty());

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
    }

    // ─────────────────────────── trial y kill switch maestro ───────────────────────────

    @Test
    @DisplayName("trial vigente → pasa sin consultar la suscripción")
    void activeTrialAllowsWithoutSubscription() throws Exception {
        tenant.setTrialEndsAt(now.plusDays(5));
        givenTenantExists();

        filter.doFilterInternal(request, response, chain);

        assertAllowed();
        verifyNoInteractions(subscriptionRepository);
    }

    @Test
    @DisplayName("baja manual (tenant inactivo) → 402 inmediato, sin mirar la suscripción")
    void inactiveTenantBlocksImmediately() throws Exception {
        tenant.setActive(false);
        tenant.setTrialEndsAt(now.plusDays(30)); // ni siquiera un trial vigente lo salva
        givenTenantExists();

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
        verifyNoInteractions(subscriptionRepository);
    }

    // ─────────────────────────── caché de veredictos ───────────────────────────

    @Test
    @DisplayName("el veredicto PERMITIDO se cachea: la 2ª request no toca la BD")
    void allowedVerdictIsCached() throws Exception {
        givenTenantExists();
        givenSubscription("active", now.plusDays(10), now.plusDays(13));

        filter.doFilterInternal(request, response, chain);
        MockHttpServletResponse second = new MockHttpServletResponse();
        filter.doFilterInternal(request, second, chain);

        verify(chain, times(2)).doFilter(any(), any());
        // Una sola consulta real: la segunda pasada salió de la caché.
        verify(tenantRepository, times(1)).findById(tenantId);
        verify(subscriptionRepository, times(1)).findFirstByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @Test
    @DisplayName("el BLOQUEO nunca se cachea: cada request reevalúa (el pago desbloquea al instante)")
    void blockedVerdictIsNeverCached() throws Exception {
        givenTenantExists();
        givenSubscription("active", now.minusDays(2), null);

        filter.doFilterInternal(request, response, chain);
        MockHttpServletResponse second = new MockHttpServletResponse();
        filter.doFilterInternal(request, second, chain);

        assertEquals(402, response.getStatus());
        assertEquals(402, second.getStatus());
        // Ambas pasadas consultaron la BD: un cobro acreditado levanta el bloqueo sin esperas.
        verify(tenantRepository, times(2)).findById(tenantId);
    }

    // ─────────────────────────── plomería del filtro ───────────────────────────

    @Test
    @DisplayName("sin contexto de tenant en ruta protegida → 401")
    void missingTenantContextReturns401() throws Exception {
        TenantContextHolder.clear();

        filter.doFilterInternal(request, response, chain);

        assertEquals(401, response.getStatus());
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    @DisplayName("tenant inexistente → 404")
    void unknownTenantReturns404() throws Exception {
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.empty());

        filter.doFilterInternal(request, response, chain);

        assertEquals(404, response.getStatus());
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    @DisplayName("ruta de facturación excluida → pasa SIEMPRE (el moroso debe poder pagar)")
    void billingRouteBypassesKillSwitch() throws Exception {
        MockHttpServletRequest billingRequest = new MockHttpServletRequest("POST", "/api/billing/checkout");

        filter.doFilterInternal(billingRequest, response, chain);

        verify(chain).doFilter(billingRequest, response);
        verifyNoInteractions(tenantRepository, subscriptionRepository);
    }

    // ─────────────────────────── período NULL y persistencia de la baja ───────────────────────────

    @Test
    @DisplayName("active con período NULL → 402 (no es acceso eterno; alineado con el cron)")
    void activeWithNullPeriodBlocks() throws Exception {
        givenTenantExists();
        givenSubscription("active", null, null);

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
    }

    @Test
    @DisplayName("al bloquear por vencimiento, persiste is_active=false (bandera maestra veraz)")
    void blockingByExpiryPersistsInactive() throws Exception {
        givenTenantExists();
        givenSubscription("active", now.minusDays(2), null);

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
        assertFalse(tenant.isActive(), "el tenant debe quedar inactivo tras el bloqueo por vencimiento");
        verify(tenantRepository).save(tenant);
    }

    @Test
    @DisplayName("la baja MANUAL (ya inactivo) no se vuelve a persistir")
    void manualBlockDoesNotPersistAgain() throws Exception {
        tenant.setActive(false);
        givenTenantExists();

        filter.doFilterInternal(request, response, chain);

        assertBlocked402();
        verify(tenantRepository, never()).save(any());
    }
}
