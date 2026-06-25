package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SubscriptionAccessPolicy.Reason;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests de la FUENTE ÚNICA DE VERDAD del acceso operativo. La misma regla la usan el
 * filtro en tiempo real y el cron nocturno; acá se cubre la matriz completa de estados
 * para que ninguna capa pueda "inventar" su propio criterio.
 */
class SubscriptionAccessPolicyTest {

    private static final ZoneId AR = ZoneId.of("America/Argentina/Buenos_Aires");

    private final SubscriptionAccessPolicy policy = new SubscriptionAccessPolicy();
    private final LocalDateTime now = LocalDateTime.now(AR);

    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = new Tenant();
        tenant.setId(UUID.randomUUID());
        tenant.setName("Gimnasio Test");
        tenant.setActive(true);     // activo a nivel maestro
        tenant.setTrialEndsAt(null); // sin trial: el acceso depende de la suscripción
    }

    private Subscription sub(String status, LocalDateTime periodEnd, LocalDateTime graceEndsAt) {
        Subscription s = new Subscription();
        s.setStatus(status);
        s.setCurrentPeriodEnd(periodEnd);
        s.setGracePeriodEndsAt(graceEndsAt);
        return s;
    }

    private void assertAllowed(SubscriptionAccessPolicy.Decision d, Reason expected) {
        assertTrue(d.allowed(), "se esperaba ACCESO");
        assertEquals(expected, d.reason());
    }

    private void assertBlocked(SubscriptionAccessPolicy.Decision d, Reason expected) {
        assertFalse(d.allowed(), "se esperaba BLOQUEO");
        assertEquals(expected, d.reason());
    }

    @Nested
    @DisplayName("baja maestra y trial")
    class MasterAndTrial {

        @Test
        @DisplayName("tenant inactivo (baja manual) → bloqueo, ni mira la suscripción")
        void masterDisabledBlocks() {
            tenant.setActive(false);
            tenant.setTrialEndsAt(now.plusDays(30));
            assertBlocked(policy.evaluate(tenant, sub("active", now.plusDays(30), null), now), Reason.MASTER_DISABLED);
        }

        @Test
        @DisplayName("trial vigente → acceso (sin suscripción)")
        void activeTrialAllows() {
            tenant.setTrialEndsAt(now.plusDays(3));
            assertAllowed(policy.evaluate(tenant, null, now), Reason.ACTIVE_TRIAL);
        }

        @Test
        @DisplayName("trial vencido y sin suscripción → bloqueo")
        void expiredTrialNoSubBlocks() {
            tenant.setTrialEndsAt(now.minusDays(1));
            assertBlocked(policy.evaluate(tenant, null, now), Reason.NO_VALID_ENTITLEMENT);
        }

        @Test
        @DisplayName("sin trial y sin suscripción → bloqueo")
        void noTrialNoSubBlocks() {
            assertBlocked(policy.evaluate(tenant, null, now), Reason.NO_VALID_ENTITLEMENT);
        }
    }

    @Nested
    @DisplayName("status: active")
    class Active {

        @Test
        @DisplayName("active con período futuro → acceso")
        void activeFutureAllows() {
            assertAllowed(policy.evaluate(tenant, sub("active", now.plusDays(10), null), now), Reason.ACTIVE_SUBSCRIPTION);
        }

        @Test
        @DisplayName("active con período VENCIDO → bloqueo (caso SEKUR migrado)")
        void activeExpiredBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("active", now.minusDays(2), null), now), Reason.NO_VALID_ENTITLEMENT);
        }

        @Test
        @DisplayName("active con período NULL → bloqueo (cierra la indulgencia del cron viejo)")
        void activeNullPeriodBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("active", null, null), now), Reason.NO_VALID_ENTITLEMENT);
        }
    }

    @Nested
    @DisplayName("status: past_due")
    class PastDue {

        @Test
        @DisplayName("past_due dentro de la gracia → acceso")
        void pastDueWithinGraceAllows() {
            assertAllowed(policy.evaluate(tenant, sub("past_due", now.minusDays(2), now.plusDays(1)), now), Reason.IN_GRACE);
        }

        @Test
        @DisplayName("past_due con gracia agotada → bloqueo")
        void pastDueAfterGraceBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("past_due", now.minusDays(5), now.minusDays(2)), now), Reason.NO_VALID_ENTITLEMENT);
        }

        @Test
        @DisplayName("past_due sin gracia definida → bloqueo")
        void pastDueNullGraceBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("past_due", now.plusDays(5), null), now), Reason.NO_VALID_ENTITLEMENT);
        }
    }

    @Nested
    @DisplayName("status: canceled")
    class Canceled {

        @Test
        @DisplayName("canceled con período aún corriendo → acceso (ya pagó ese mes)")
        void canceledWithinPeriodAllows() {
            assertAllowed(policy.evaluate(tenant, sub("canceled", now.plusDays(7), null), now), Reason.CANCELED_PAID_PERIOD);
        }

        @Test
        @DisplayName("canceled con período terminado → bloqueo")
        void canceledExpiredBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("canceled", now.minusDays(1), null), now), Reason.NO_VALID_ENTITLEMENT);
        }
    }

    @Nested
    @DisplayName("estados sin acceso")
    class NoAccessStates {

        @Test
        @DisplayName("expired → bloqueo aunque el período figure futuro")
        void expiredBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("expired", now.plusDays(30), null), now), Reason.NO_VALID_ENTITLEMENT);
        }

        @Test
        @DisplayName("pending_payment (alta esperando cobro) → bloqueo")
        void pendingPaymentBlocks() {
            assertBlocked(policy.evaluate(tenant, sub("pending_payment", now.plusDays(30), null), now), Reason.NO_VALID_ENTITLEMENT);
        }

        @Test
        @DisplayName("status null → bloqueo")
        void nullStatusBlocks() {
            assertBlocked(policy.evaluate(tenant, sub(null, now.plusDays(30), null), now), Reason.NO_VALID_ENTITLEMENT);
        }
    }

    @Test
    @DisplayName("la suscripción válida tiene prioridad sobre un trial vencido")
    void validSubBeatsExpiredTrial() {
        tenant.setTrialEndsAt(now.minusDays(10));
        assertAllowed(policy.evaluate(tenant, sub("active", now.plusDays(10), null), now), Reason.ACTIVE_SUBSCRIPTION);
    }
}
