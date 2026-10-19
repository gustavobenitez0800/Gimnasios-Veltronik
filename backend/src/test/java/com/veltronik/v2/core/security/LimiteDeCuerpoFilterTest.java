package com.veltronik.v2.core.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** El tope de tamaño de las puertas sin sesión. */
class LimiteDeCuerpoFilterTest {

    private final LimiteDeCuerpoFilter filtro = new LimiteDeCuerpoFilter();

    @Test
    @DisplayName("un pedido público que declara más de 1 MB se corta con 413, sin seguir de largo")
    void cortaLoGordo() throws Exception {
        MockHttpServletRequest pedido = post("/api/public/checkin", new byte[(int) LimiteDeCuerpoFilter.MAX_BYTES + 1]);
        MockHttpServletResponse respuesta = new MockHttpServletResponse();
        MockFilterChain cadena = new MockFilterChain();

        filtro.doFilter(pedido, respuesta, cadena);

        assertEquals(413, respuesta.getStatus());
        assertNull(cadena.getRequest(), "no tiene que llegar ni a la seguridad ni al controlador");
    }

    @Test
    @DisplayName("un aviso normal pasa")
    void dejaPasarLoNormal() throws Exception {
        MockHttpServletRequest pedido = post("/api/public/molinete/tok", "{\"personId\":\"1\"}".getBytes(StandardCharsets.UTF_8));
        MockFilterChain cadena = new MockFilterChain();

        filtro.doFilter(pedido, new MockHttpServletResponse(), cadena);

        assertNotNull(cadena.getRequest());
    }

    @Test
    @DisplayName("con sesión no se mete: las importaciones de socios pesan más y tienen su propio control")
    void noTocaLoQueTieneSesion() {
        assertTrue(filtro.shouldNotFilter(post("/api/gym/members/import", new byte[0])));
        assertFalse(filtro.shouldNotFilter(post("/api/webhooks/mercadopago", new byte[0])));
    }

    @Test
    @DisplayName("sin largo declarado, la lectura falla al pasar el tope")
    void cuentaAlLeer() throws IOException {
        byte[] gordo = new byte[(int) LimiteDeCuerpoFilter.MAX_BYTES + 10];
        MockHttpServletRequest pedido = post("/api/public/checkin", gordo);
        InputStream cuerpo = new LimiteDeCuerpoFilter.CuerpoConTope(pedido).getInputStream();

        assertThrows(IOException.class, () -> cuerpo.readAllBytes());
    }

    @Test
    @DisplayName("un juego de caracteres inventado no termina en un 500")
    void charsetInventado() {
        assertEquals(StandardCharsets.UTF_8, LimiteDeCuerpoFilter.CuerpoConTope.charset("no-existe-ñ"));
    }

    private static MockHttpServletRequest post(String uri, byte[] cuerpo) {
        MockHttpServletRequest pedido = new MockHttpServletRequest("POST", uri);
        pedido.setContent(cuerpo);
        return pedido;
    }
}
