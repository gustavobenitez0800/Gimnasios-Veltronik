package com.veltronik.v2.core.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El catálogo es el <b>único</b> lugar que decide cuánto se le cobra a alguien.
 *
 * <p>Lo que se prueba acá no es una preferencia de diseño: el precio no puede salir de lo que
 * mande el navegador. Si el monto viajara en el pedido, cualquiera contrataría el premium por
 * mil pesos editando la request — y el error se descubriría recién al mirar la facturación.</p>
 */
class PlanCatalogTest {

    private static PlanCatalog catalogo(boolean premiumALaVenta) {
        BillingProperties billing = new BillingProperties(
                new BigDecimal("45000"), 14, "https://app.veltronik.test");
        return new PlanCatalog(billing, new BigDecimal("80000"), premiumALaVenta);
    }

    @Test
    @DisplayName("Los dos precios salen de la configuración, no del código")
    void losPreciosSalenDeLaConfiguracion() {
        PlanCatalog c = catalogo(true);

        assertEquals(new BigDecimal("45000"), c.get(PlanCode.BASICO).price());
        assertEquals(new BigDecimal("80000"), c.get(PlanCode.PREMIUM).price());
    }

    @Test
    @DisplayName("Solo el premium abre el control de acceso")
    void soloElPremiumAbreElMolinete() {
        PlanCatalog c = catalogo(true);

        assertTrue(c.unlocks(PlanCode.PREMIUM, PlanFeature.CONTROL_DE_ACCESO));
        assertEquals(false, c.unlocks(PlanCode.BASICO, PlanFeature.CONTROL_DE_ACCESO));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lo que pide el cliente al ir a pagar
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Pedir el premium cuando está a la venta cobra 80.000")
    void pedirPremiumCobraPremium() {
        var plan = catalogo(true).resolverPedido("PREMIUM");

        assertEquals(PlanCode.PREMIUM, plan.code());
        assertEquals(new BigDecimal("80000"), plan.price());
    }

    /**
     * El premium se despliega apagado y se enciende el día que se vende. Mientras tanto, pedirlo
     * a mano no puede contratarlo: se caería en un cobro de algo que todavía no se ofrece.
     */
    @Test
    @DisplayName("Pedir el premium cuando NO está a la venta cae en básico")
    void premiumApagadoCaeEnBasico() {
        var plan = catalogo(false).resolverPedido("PREMIUM");

        assertEquals(PlanCode.BASICO, plan.code());
        assertEquals(new BigDecimal("45000"), plan.price());
    }

    /**
     * Falla hacia MENOS acceso, igual que PlanPolicy: equivocarse hacia abajo se arregla con una
     * llamada del cliente; hacia arriba, se regala lo que se está vendiendo.
     */
    @Test
    @DisplayName("Un código que no se entiende cae en básico, nunca en premium")
    void loQueNoSeEntiendeCaeEnBasico() {
        PlanCatalog c = catalogo(true);

        assertEquals(PlanCode.BASICO, c.resolverPedido(null).code());
        assertEquals(PlanCode.BASICO, c.resolverPedido("").code());
        assertEquals(PlanCode.BASICO, c.resolverPedido("   ").code());
        assertEquals(PlanCode.BASICO, c.resolverPedido("PREMIUM_GRATIS").code());
        assertEquals(PlanCode.BASICO, c.resolverPedido("80000").code());
    }

    @Test
    @DisplayName("Con el premium apagado, la lista que ve el cliente trae un solo plan")
    void conPremiumApagadoSeOfreceUnoSolo() {
        assertEquals(1, catalogo(false).available().size());
        assertEquals(2, catalogo(true).available().size());
        // Los dos existen siempre para el gateo, se vendan o no.
        assertEquals(2, catalogo(false).all().size());
    }
}
