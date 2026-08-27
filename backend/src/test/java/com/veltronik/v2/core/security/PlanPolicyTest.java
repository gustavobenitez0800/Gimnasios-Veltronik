package com.veltronik.v2.core.security;

import com.veltronik.v2.core.config.BillingProperties;
import com.veltronik.v2.core.config.PlanCatalog;
import com.veltronik.v2.core.config.PlanCode;
import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * El gateo por plan tiene una sola forma de fallar mal: dar de más. Estos tests fijan que
 * siempre caiga hacia el plan más chico cuando el dato no alcanza.
 */
class PlanPolicyTest {

    private SubscriptionRepository repo;
    private PlanPolicy policy;
    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repo = mock(SubscriptionRepository.class);
        PlanCatalog catalog = new PlanCatalog(
                new BillingProperties(new BigDecimal("45000"), 14, "https://app.test"),
                new BigDecimal("80000"),
                true); // el catálogo interno conoce el premium aunque no se ofrezca a la venta
        policy = new PlanPolicy(repo, catalog);
    }

    private void conPlan(String planCode) {
        Subscription sub = new Subscription();
        sub.setPlanCode(planCode);
        when(repo.findFirstByTenantIdOrderByCreatedAtDesc(any())).thenReturn(Optional.of(sub));
    }

    @Nested
    @DisplayName("ante la duda, básico")
    class FallaHaciaAbajo {

        @Test
        @DisplayName("sin suscripción → básico")
        void sinSuscripcion() {
            when(repo.findFirstByTenantIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());

            assertEquals(PlanCode.BASICO, policy.planOf(tenantId));
            assertFalse(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("sin tenant en la sesión → básico, no explota")
        void sinTenant() {
            assertEquals(PlanCode.BASICO, policy.planOf(null));
            assertFalse(policy.hasFeature(null, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("un plan que este build no conoce → básico, nunca premium")
        void planDesconocido() {
            conPlan("PLAN_DEL_FUTURO");

            assertEquals(PlanCode.BASICO, policy.planOf(tenantId));
            assertFalse(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("el dato en blanco → básico")
        void planVacio() {
            conPlan("   ");

            assertEquals(PlanCode.BASICO, policy.planOf(tenantId));
        }
    }

    @Nested
    @DisplayName("el candado real")
    class Candado {

        @Test
        @DisplayName("el básico NO abre el control de acceso")
        void basicoNoAbreLaPuerta() {
            conPlan("BASICO");

            assertFalse(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("el premium SÍ abre el control de acceso")
        void premiumAbreLaPuerta() {
            conPlan("PREMIUM");

            assertEquals(PlanCode.PREMIUM, policy.planOf(tenantId));
            assertTrue(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("el código guardado no depende de mayúsculas ni espacios")
        void tolerantePeroEstricto() {
            conPlan(" premium ");

            assertEquals(PlanCode.PREMIUM, policy.planOf(tenantId));
        }
    }
}
