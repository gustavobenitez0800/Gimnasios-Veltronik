package com.veltronik.v2.gym.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * La comparación de documentos del check-in.
 *
 * <p>La primera versión comparaba el texto tal cual y no encontraba a nadie: en la ficha estaba
 * {@code 30.111.222} y el socio escribía {@code 30111222}. El sistema decía "no te encontramos"
 * con el número bien puesto, que es la peor forma de fallar — el socio no tiene manera de saber
 * qué está mal.</p>
 */
class CheckinServiceTest {

    private static String n(String s) { return CheckinService.normalizarDocumento(s); }

    @Test
    @DisplayName("con puntos o sin puntos es la misma persona")
    void losPuntosSonAdorno() {
        assertEquals(n("30111222"), n("30.111.222"));
        assertEquals(n("30111222"), n("30 111 222"));
        assertEquals(n("30111222"), n("30-111-222"));
    }

    @Test
    @DisplayName("los espacios de más no rompen nada")
    void espaciosAlPegar() {
        assertEquals(n("30111222"), n("  30111222 "));
        assertEquals(n("30111222"), n("30.111.222\n"));
    }

    @Test
    @DisplayName("un pasaporte con letras sobrevive, sin importar mayúsculas")
    void pasaporteConLetras() {
        assertEquals("AB123456", n("ab 123.456"));
        assertEquals(n("AB123456"), n("ab-123456"));
    }

    @Test
    @DisplayName("sigue siendo exacto: dos documentos distintos NO se confunden")
    void noEsUnLike() {
        // Lo importante de normalizar es que NO se convierta en una búsqueda floja: un
        // documento que es prefijo de otro tiene que seguir siendo otra persona.
        assertNotEquals(n("3011122"), n("30111222"));
        assertNotEquals(n("30111222"), n("301112223"));
    }

    @Test
    @DisplayName("nulo y vacío no explotan y no matchean con nada")
    void nuloYVacio() {
        assertEquals("", n(null));
        assertEquals("", n(""));
        assertEquals("", n("...---   "));
    }
}
