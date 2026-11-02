package com.veltronik.v2.core.security;

import com.veltronik.v2.core.config.BillingProperties;
import com.veltronik.v2.core.config.PlanCatalog;
import com.veltronik.v2.core.config.PlanCode;
import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.entities.Subscription;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
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
    private TenantRepository tenants;
    private PlanPolicy policy;
    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repo = mock(SubscriptionRepository.class);
        tenants = mock(TenantRepository.class);
        PlanCatalog catalog = new PlanCatalog(
                new BillingProperties(new BigDecimal("45000"), 14, "https://app.test"),
                new BigDecimal("80000"),
                true); // el catálogo interno conoce el premium aunque no se ofrezca a la venta
        policy = new PlanPolicy(repo, catalog, tenants, new SubscriptionAccessPolicy());
    }

    /** La prueba gratis del gimnasio termina en tantos días (negativo: ya terminó). */
    private void conPruebaQueTerminaEn(int dias) {
        Tenant t = new Tenant();
        t.setTrialEndsAt(LocalDateTime.now(ZoneId.of("America/Argentina/Buenos_Aires")).plusDays(dias));
        when(tenants.findById(tenantId)).thenReturn(Optional.of(t));
    }

    /** Una suscripción con su estado y su mes (en días desde hoy). */
    private void conSuscripcion(String planCode, String estado, int diasDeMes) {
        Subscription sub = new Subscription();
        sub.setPlanCode(planCode);
        sub.setStatus(estado);
        sub.setCurrentPeriodEnd(LocalDateTime.now(ZoneId.of("America/Argentina/Buenos_Aires")).plusDays(diasDeMes));
        when(repo.findFirstByTenantIdOrderByCreatedAtDesc(any())).thenReturn(Optional.of(sub));
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

    /**
     * La prueba gratis es el Premium entero (02/11/2026): un gimnasio con molinete lo prueba
     * antes de pagar. Pero el plan CONTRATADO —el que se cobra— no se toca.
     */
    @Nested
    @DisplayName("la prueba gratis incluye el molinete")
    class PruebaGratis {

        @Test
        @DisplayName("⭐ en la prueba, sin pagar todavía, el molinete anda y se sabe hasta cuándo")
        void enLaPruebaAnda() {
            when(repo.findFirstByTenantIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());
            conPruebaQueTerminaEn(5);

            PlanPolicy.PlanEnUso plan = policy.enUso(tenantId);

            assertEquals(PlanCode.PREMIUM, plan.plan());
            assertTrue(plan.porLaPrueba());
            assertTrue(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("🔴 la prueba NO cambia el plan contratado: cambiar la tarjeta no cobra Premium")
        void noCambiaLoQueSeCobra() {
            conSuscripcion("BASICO", "pending", 30);
            conPruebaQueTerminaEn(5);

            assertEquals(PlanCode.BASICO, policy.planOf(tenantId));
            assertTrue(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO),
                    "un pago pendiente no le corta la prueba");
        }

        @Test
        @DisplayName("quien ya paga usa lo que compró, aunque le queden días de prueba")
        void quienPagaUsaLoQueCompro() {
            conSuscripcion("BASICO", "active", 30);
            conPruebaQueTerminaEn(5);

            assertEquals(PlanCode.BASICO, policy.enUso(tenantId).plan());
            assertFalse(policy.enUso(tenantId).porLaPrueba());
            assertFalse(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("terminada la prueba, vuelve al contratado")
        void terminadaLaPrueba() {
            when(repo.findFirstByTenantIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());
            conPruebaQueTerminaEn(-1);

            assertEquals(PlanCode.BASICO, policy.enUso(tenantId).plan());
            assertFalse(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }

        @Test
        @DisplayName("una sucursal adicional (sin prueba) no la tiene")
        void sucursalSinPrueba() {
            when(repo.findFirstByTenantIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());
            when(tenants.findById(tenantId)).thenReturn(Optional.of(new Tenant()));

            assertFalse(policy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO));
        }
    }
}
