package com.veltronik.v2.gym.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Qué cuenta como "el mismo llavero" (ADR-016 §2). Es la misma regla que aplica la pantalla en
 * {@code lib/llaveros.js}: si cambia una, cambia la otra, y este test con su gemelo lo dicen.
 */
@DisplayName("La regla del llavero")
class LlaveroTest {

    @Test
    @DisplayName("⭐ sin espacios y en mayúsculas, y nada más: los ceros de adelante se quedan")
    void normalizar() {
        assertEquals("0012345678", Llavero.normalizar("  0012345678\r\n"));
        assertEquals("00BC5678", Llavero.normalizar("00bc 5678"));
        assertEquals("188,22136", Llavero.normalizar("188,22136"));
        assertEquals("", Llavero.normalizar(null));
    }

    @Test
    @DisplayName("🔴 0012345678 no se convierte en 12345678, que tiene forma de DNI")
    void losCerosNoSeVan() {
        assertEquals(10, Llavero.normalizar("0012345678").length());
    }

    @Test
    @DisplayName("un llavero tiene entre 4 y 64 letras, dígitos o separadores de lector")
    void esValido() {
        assertTrue(Llavero.esValido("0012345678"));
        assertTrue(Llavero.esValido("188,22136"));
        assertTrue(Llavero.esValido("00:BC:56:78"));
        assertFalse(Llavero.esValido("123"));
        assertFalse(Llavero.esValido("1".repeat(65)));
        assertFalse(Llavero.esValido("0012Ñ45678"), "una tecla de otra distribución no es un llavero");
        assertFalse(Llavero.esValido(""));
        assertFalse(Llavero.esValido(null));
    }

    @Test
    @DisplayName("⭐ un documento parece llavero si son nueve dígitos o más, como los guardaba ControlFit")
    void pareceLlavero() {
        assertTrue(Llavero.pareceLlavero("0012345678"));
        assertTrue(Llavero.pareceLlavero("12345678901"));
        assertFalse(Llavero.pareceLlavero("30111222"), "un DNI");
        assertFalse(Llavero.pareceLlavero("01234567"), "un DNI de siete dígitos rellenado con un cero");
        assertFalse(Llavero.pareceLlavero("30.111.222"));
        assertFalse(Llavero.pareceLlavero("AB1234567"));
        assertFalse(Llavero.pareceLlavero(null));
    }
}
