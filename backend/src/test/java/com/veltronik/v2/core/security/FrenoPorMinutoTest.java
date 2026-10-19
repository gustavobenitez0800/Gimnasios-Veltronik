package com.veltronik.v2.core.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El freno de las puertas públicas. Lo que importa fijar es que frene lo que tiene que frenar
 * y, sobre todo, que <b>no crezca sin fin</b>: antes, un chorro de tokens inventados llenaba la
 * memoria del servidor hasta voltearlo.
 */
class FrenoPorMinutoTest {

    private final AtomicLong reloj = new AtomicLong(1_000_000);
    private final FrenoPorMinuto freno = new FrenoPorMinuto(reloj::get);

    @Test
    @DisplayName("frena al llegar al tope del minuto, y al minuto siguiente vuelve a dejar pasar")
    void frenaYSeReinicia() {
        for (int i = 0; i < 5; i++) freno.registrar("cartel", false);
        assertTrue(freno.frenado("cartel", 5, 100));

        reloj.addAndGet(60);
        assertFalse(freno.frenado("cartel", 5, 100));
    }

    @Test
    @DisplayName("los fallos tienen su propio tope, más bajo que el total")
    void losFallosFrenanAntes() {
        for (int i = 0; i < 3; i++) freno.registrar("cartel", true);
        assertTrue(freno.frenado("cartel", 40, 3));
        assertFalse(freno.frenado("otro-cartel", 40, 3));
    }

    @Test
    @DisplayName("un chorro de tokens inventados no pasa del techo de memoria")
    void tieneTecho() {
        for (int i = 0; i < FrenoPorMinuto.MAX_CLAVES + 5_000; i++) {
            freno.registrar("inventado-" + i, true);
        }
        assertEquals(FrenoPorMinuto.MAX_CLAVES, freno.claves());
    }

    @Test
    @DisplayName("con el techo tocado, las claves vencidas dejan lugar a las nuevas")
    void lasVencidasSeVan() {
        for (int i = 0; i < FrenoPorMinuto.MAX_CLAVES; i++) freno.registrar("viejo-" + i, false);

        reloj.addAndGet(61);
        freno.registrar("cartel-real", false);

        assertEquals(1, freno.claves());
    }

    @Test
    @DisplayName("lleno de claves vivas, un token real que ya estaba se sigue frenando")
    void loQueYaEstabaSigueFrenado() {
        for (int i = 0; i < 10; i++) freno.registrar("cartel-real", true);
        for (int i = 0; i < FrenoPorMinuto.MAX_CLAVES; i++) freno.registrar("inventado-" + i, true);

        assertTrue(freno.frenado("cartel-real", 40, 10));
    }
}
