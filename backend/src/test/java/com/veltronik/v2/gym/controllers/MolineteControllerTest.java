package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.config.PlanCode;
import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.exceptions.FeatureNotInPlanException;
import com.veltronik.v2.core.security.PlanPolicy;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.services.MolineteService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * El candado del plan sobre el padrón del molinete.
 *
 * <p><b>Lo que estos tests defienden no es que bloquee — es CÓMO bloquea.</b> El padrón devolvía
 * <b>402</b> cuando la función no estaba en el plan, y el interceptor del frontend trata
 * cualquier 402 como "sucursal impaga": le mostraba el muro de cobro a un gimnasio al día. Como
 * el escritorio pide el padrón cada varios minutos, el síntoma era entrar, trabajar un rato, y
 * que apareciera "Renová la suscripción" de la nada. Con el premium apagado todos los clientes
 * resuelven a básico, así que alcanzaba a todos.</p>
 *
 * <p>La regla que se fija acá: <b>402 significa «no pagaste»; 403 significa «pagaste, pero esto
 * no te corresponde»</b>. Si alguien vuelve a poner 402 en este camino, estos tests se ponen en
 * rojo.</p>
 */
class MolineteControllerTest {

    private static final UUID TENANT = UUID.fromString("a8712a90-cae6-4a34-a018-8821994e5ffd");

    private MolineteService service;
    private PlanPolicy planPolicy;
    private MolineteController controller;

    @BeforeEach
    void setUp() {
        service = mock(MolineteService.class);
        planPolicy = mock(PlanPolicy.class);
        controller = new MolineteController(service, planPolicy);
        TenantContextHolder.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    @Test
    @DisplayName("sin el control de acceso en el plan: 403 con código, NUNCA 402")
    void sinLaFuncionDevuelve403ConCodigo() {
        when(planPolicy.hasFeature(eq(TENANT), eq(PlanFeature.CONTROL_DE_ACCESO))).thenReturn(false);

        FeatureNotInPlanException ex = assertThrows(FeatureNotInPlanException.class,
                () -> controller.padron());

        // El código es lo que el frontend mira para NO confundirlo con una deuda.
        assertEquals("FEATURE_NOT_IN_PLAN", FeatureNotInPlanException.CODIGO);
        assertTrue(ex.getMessage().toLowerCase().contains("plan"),
                "el mensaje tiene que hablar del plan, no del pago: " + ex.getMessage());
    }

    @Test
    @DisplayName("el bloqueo del plan no puede viajar como 402 — eso dispara el muro de cobro")
    void nuncaEs402() {
        when(planPolicy.hasFeature(any(), any())).thenReturn(false);

        Exception ex = assertThrows(Exception.class, () -> controller.padron());

        // Si vuelve a ser un ResponseStatusException(PAYMENT_REQUIRED), esto cae.
        assertInstanceOf(FeatureNotInPlanException.class, ex,
                "un bloqueo por plan no es un 402: le dice 'estás en deuda' a un cliente al día");
        if (ex instanceof ResponseStatusException rse) {
            assertEquals(403, rse.getStatusCode().value());
        }
    }

    @Test
    @DisplayName("sin la función, el padrón ni se consulta")
    void sinLaFuncionNoTocaElServicio() {
        when(planPolicy.hasFeature(any(), any())).thenReturn(false);

        assertThrows(FeatureNotInPlanException.class, () -> controller.padron());

        verify(service, never()).padron(any());
    }

    @Test
    @DisplayName("con el control de acceso en el plan: 200 y el padrón del gimnasio")
    void conLaFuncionDevuelveElPadron() {
        when(planPolicy.hasFeature(eq(TENANT), eq(PlanFeature.CONTROL_DE_ACCESO))).thenReturn(true);
        when(service.padron(TENANT)).thenReturn(List.of());

        var res = controller.padron();

        assertEquals(200, res.getStatusCode().value());
        verify(service).padron(TENANT);
    }

    @Test
    @DisplayName("la cajita pregunta si el plan la habilita: un sí o un no, sin bajar el padrón")
    void habilitadoDiceSiOnoSinBajarElPadron() {
        var premium = new PlanPolicy.PlanEnUso(PlanCode.PREMIUM, null);
        when(planPolicy.enUso(TENANT)).thenReturn(premium);
        when(planPolicy.habilita(eq(premium), eq(PlanFeature.CONTROL_DE_ACCESO))).thenReturn(true);
        var si = controller.habilitado().getBody();
        assertEquals(Boolean.TRUE, si.get("habilitado"));
        assertEquals(Boolean.FALSE, si.get("porLaPrueba"));
        assertNull(si.get("pruebaHasta"));

        var basico = new PlanPolicy.PlanEnUso(PlanCode.BASICO, null);
        when(planPolicy.enUso(TENANT)).thenReturn(basico);
        when(planPolicy.habilita(eq(basico), eq(PlanFeature.CONTROL_DE_ACCESO))).thenReturn(false);
        var res = controller.habilitado();
        // Un "no" no es un error: 200, y la pantalla lo explica.
        assertEquals(200, res.getStatusCode().value());
        assertEquals(Boolean.FALSE, res.getBody().get("habilitado"));

        verify(service, never()).padron(any());
    }

    @Test
    @DisplayName("⭐ en la prueba gratis dice que sí, y hasta cuándo: Ajustes lo avisa")
    void enLaPruebaDiceHastaCuando() {
        LocalDateTime fin = LocalDateTime.of(2026, 11, 14, 10, 30);
        var prueba = new PlanPolicy.PlanEnUso(PlanCode.PREMIUM, fin);
        when(planPolicy.enUso(TENANT)).thenReturn(prueba);
        when(planPolicy.habilita(eq(prueba), eq(PlanFeature.CONTROL_DE_ACCESO))).thenReturn(true);

        var body = controller.habilitado().getBody();

        assertEquals(Boolean.TRUE, body.get("habilitado"));
        assertEquals(Boolean.TRUE, body.get("porLaPrueba"));
        assertEquals(fin, body.get("pruebaHasta"));
    }
}
