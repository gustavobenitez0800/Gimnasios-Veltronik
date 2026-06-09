package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantPayment;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantPaymentRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests de applyApprovedPayment: el ÚNICO punto del sistema que otorga acceso pago.
 *
 * Dos invariantes críticas:
 *  - IDEMPOTENCIA por mpPaymentId: Mercado Pago reintenta webhooks; un mismo cobro
 *    no puede aplicarse dos veces.
 *  - NO APILAR período: el cobro otorga "al menos 30 días desde hoy", pero si ya hay
 *    un período vigente MAYOR (p. ej. la activación del alta ya dio 30d), no se suma.
 */
@ExtendWith(MockitoExtension.class)
class SubscriptionBillingServiceTest {

    /** Misma zona que usa el servicio: el "ahora" del negocio es hora Argentina. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final int ACCESS_DAYS = 30;
    private static final int GRACE_DAYS = 3;

    @Mock
    private TenantRepository tenantRepository;
    @Mock
    private TenantPaymentRepository tenantPaymentRepository;
    @Mock
    private SubscriptionRepository subscriptionRepository;

    @InjectMocks
    private SubscriptionBillingService service;

    private final UUID tenantId = UUID.randomUUID();
    private final String mpPaymentId = "mp-pago-001";
    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = new Tenant();
        tenant.setId(tenantId);
        tenant.setName("Gimnasio Test");
        tenant.setActive(true);
    }

    private void givenFreshPaymentForExistingTenant() {
        when(tenantPaymentRepository.existsByMpPaymentId(mpPaymentId)).thenReturn(false);
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
    }

    private Subscription givenExistingSubscription() {
        Subscription sub = new Subscription();
        sub.setStatus("past_due");
        when(subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId))
                .thenReturn(Optional.of(sub));
        return sub;
    }

    /** Asserts que {@code actual} cae en [antes+30d, después+30d] (el now interno no es inyectable). */
    private static void assertAboutDaysFromNow(LocalDateTime before, LocalDateTime after,
                                               LocalDateTime actual, int days) {
        assertNotNull(actual);
        assertFalse(actual.isBefore(before.plusDays(days)), "período menor al esperado: " + actual);
        assertFalse(actual.isAfter(after.plusDays(days)), "período mayor al esperado: " + actual);
    }

    // ─────────────────────────── idempotencia ───────────────────────────

    @Test
    @DisplayName("un mpPaymentId ya procesado NO se aplica de nuevo (reintentos de MP)")
    void duplicatePaymentIsIgnored() {
        when(tenantPaymentRepository.existsByMpPaymentId(mpPaymentId)).thenReturn(true);

        boolean applied = service.applyApprovedPayment(tenantId, mpPaymentId, BigDecimal.valueOf(80000), null);

        assertFalse(applied);
        verify(tenantPaymentRepository, never()).save(any());
        verify(tenantRepository, never()).save(any());
        verify(subscriptionRepository, never()).save(any());
    }

    @Test
    @DisplayName("tenant inexistente → no se aplica ni se registra nada")
    void unknownTenantIsIgnored() {
        when(tenantPaymentRepository.existsByMpPaymentId(mpPaymentId)).thenReturn(false);
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.empty());

        boolean applied = service.applyApprovedPayment(tenantId, mpPaymentId, BigDecimal.valueOf(80000), null);

        assertFalse(applied);
        verify(tenantPaymentRepository, never()).save(any());
        verify(subscriptionRepository, never()).save(any());
    }

    // ─────────────────────────── cobro aplicado ───────────────────────────

    @Test
    @DisplayName("cobro nuevo: registra el pago APPROVED, reactiva el tenant y da ~30 días")
    void freshPaymentGrantsThirtyDaysAndReactivates() {
        givenFreshPaymentForExistingTenant();
        Subscription sub = givenExistingSubscription();
        tenant.setActive(false); // tenant bloqueado (caso moroso que regulariza)
        tenant.setTrialEndsAt(null);

        LocalDateTime before = LocalDateTime.now(BUSINESS_ZONE);
        boolean applied = service.applyApprovedPayment(
                tenantId, mpPaymentId, BigDecimal.valueOf(80000), "preapproval-9");
        LocalDateTime after = LocalDateTime.now(BUSINESS_ZONE);

        assertTrue(applied);

        // 1) Historial de cobros del SaaS
        ArgumentCaptor<TenantPayment> paymentCaptor = ArgumentCaptor.forClass(TenantPayment.class);
        verify(tenantPaymentRepository).save(paymentCaptor.capture());
        TenantPayment payment = paymentCaptor.getValue();
        assertEquals(mpPaymentId, payment.getMpPaymentId());
        assertEquals("preapproval-9", payment.getMpPreapprovalId());
        assertEquals("APPROVED", payment.getStatus());
        assertEquals(BigDecimal.valueOf(80000), payment.getAmount());

        // 2) Acceso del tenant: reactivado y con ~30 días desde hoy
        verify(tenantRepository).save(tenant);
        assertTrue(tenant.isActive());
        assertAboutDaysFromNow(before, after, tenant.getTrialEndsAt(), ACCESS_DAYS);

        // 3) Subscriptions al día (lo que lee el Kill Switch)
        verify(subscriptionRepository).save(sub);
        assertEquals("active", sub.getStatus());
        assertEquals(tenant.getTrialEndsAt(), sub.getCurrentPeriodEnd());
        assertEquals(tenant.getTrialEndsAt().plusDays(GRACE_DAYS), sub.getGracePeriodEndsAt());
        assertEquals("approved", sub.getLastChargeStatus());
        assertEquals("preapproval-9", sub.getMpSubscriptionId());
    }

    @Test
    @DisplayName("NO apila: si ya hay un período vigente mayor a hoy+30d, se conserva ese período")
    void doesNotStackOnLargerCurrentPeriod() {
        givenFreshPaymentForExistingTenant();
        Subscription sub = givenExistingSubscription();
        LocalDateTime vigente = LocalDateTime.now(BUSINESS_ZONE).plusDays(60);
        tenant.setTrialEndsAt(vigente); // la activación del alta ya otorgó un período largo

        boolean applied = service.applyApprovedPayment(tenantId, mpPaymentId, BigDecimal.valueOf(80000), null);

        assertTrue(applied);
        // El período NO se movió a vigente+30: sigue siendo el mayor de los dos.
        assertEquals(vigente, tenant.getTrialEndsAt());
        assertEquals(vigente, sub.getCurrentPeriodEnd());
        assertEquals(vigente.plusDays(GRACE_DAYS), sub.getGracePeriodEndsAt());
        // El cobro SÍ queda registrado igual (historial / idempotencia futura).
        verify(tenantPaymentRepository).save(any(TenantPayment.class));
    }

    @Test
    @DisplayName("renovación con período vencido: extiende a ~hoy+30d (no desde el vencimiento)")
    void renewalAfterExpiryExtendsFromToday() {
        givenFreshPaymentForExistingTenant();
        givenExistingSubscription();
        tenant.setTrialEndsAt(LocalDateTime.now(BUSINESS_ZONE).minusDays(2)); // venció anteayer

        LocalDateTime before = LocalDateTime.now(BUSINESS_ZONE);
        boolean applied = service.applyApprovedPayment(tenantId, mpPaymentId, BigDecimal.valueOf(80000), null);
        LocalDateTime after = LocalDateTime.now(BUSINESS_ZONE);

        assertTrue(applied);
        assertAboutDaysFromNow(before, after, tenant.getTrialEndsAt(), ACCESS_DAYS);
    }

    @Test
    @DisplayName("sin suscripción previa: crea una nueva 'active' asociada al tenant")
    void createsSubscriptionWhenNoneExists() {
        givenFreshPaymentForExistingTenant();
        when(subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId))
                .thenReturn(Optional.empty());

        boolean applied = service.applyApprovedPayment(tenantId, mpPaymentId, BigDecimal.valueOf(80000), null);

        assertTrue(applied);
        ArgumentCaptor<Subscription> subCaptor = ArgumentCaptor.forClass(Subscription.class);
        verify(subscriptionRepository).save(subCaptor.capture());
        Subscription created = subCaptor.getValue();
        assertEquals("active", created.getStatus());
        assertEquals(tenant, created.getTenant());
        assertNotNull(created.getCurrentPeriodEnd());
    }

    @Test
    @DisplayName("monto null se registra como CERO (no rompe el historial)")
    void nullAmountIsStoredAsZero() {
        givenFreshPaymentForExistingTenant();
        givenExistingSubscription();

        boolean applied = service.applyApprovedPayment(tenantId, mpPaymentId, null, null);

        assertTrue(applied);
        ArgumentCaptor<TenantPayment> paymentCaptor = ArgumentCaptor.forClass(TenantPayment.class);
        verify(tenantPaymentRepository).save(paymentCaptor.capture());
        assertEquals(BigDecimal.ZERO, paymentCaptor.getValue().getAmount());
    }
}
