package com.veltronik.v2.core.observabilidad;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El sello que hace rastreable un pedido.
 *
 * <p>Lo que se defiende acá no es que el sello exista, sino <b>que no se filtre entre
 * pedidos</b> y <b>que lo que llega de afuera no pueda ensuciar el registro</b>. Las dos
 * cosas fallan en silencio: un MDC sin limpiar pega el sello de un gimnasio en las líneas
 * del siguiente, y un identificador con saltos de línea inyecta líneas falsas en un log que
 * después alguien lee para entender qué pasó.</p>
 */
class CorrelationIdFilterTest {

    private final CorrelationIdFilter filtro = new CorrelationIdFilter();

    @AfterEach
    void limpiar() {
        MDC.clear();
    }

    @Test
    @DisplayName("sin encabezado: genera un sello y lo devuelve en la respuesta")
    void generaSelloPropio() throws Exception {
        var req = new MockHttpServletRequest();
        var res = new MockHttpServletResponse();

        filtro.doFilter(req, res, (a, b) -> {
            assertNotNull(MDC.get(CorrelationIdFilter.MDC_KEY), "durante el pedido tiene que haber sello");
        });

        String devuelto = res.getHeader(CorrelationIdFilter.HEADER);
        assertNotNull(devuelto, "el sello tiene que volver en la respuesta");
        assertFalse(devuelto.isBlank());
    }

    @Test
    @DisplayName("con encabezado valido: lo respeta, para seguir la operacion de punta a punta")
    void respetaElQueLlega() throws Exception {
        var req = new MockHttpServletRequest();
        req.addHeader(CorrelationIdFilter.HEADER, "mostrador-7f3a");
        var res = new MockHttpServletResponse();

        final String[] visto = new String[1];
        filtro.doFilter(req, res, (a, b) -> visto[0] = MDC.get(CorrelationIdFilter.MDC_KEY));

        assertEquals("mostrador-7f3a", visto[0]);
        assertEquals("mostrador-7f3a", res.getHeader(CorrelationIdFilter.HEADER));
    }

    @Test
    @DisplayName("un sello con saltos de linea NO entra al log: se descarta y se genera otro")
    void noSePuedeInyectarEnElLog() throws Exception {
        var req = new MockHttpServletRequest();
        req.addHeader(CorrelationIdFilter.HEADER, "malicioso\nERROR  se borro la base");
        var res = new MockHttpServletResponse();

        final String[] visto = new String[1];
        filtro.doFilter(req, res, (a, b) -> visto[0] = MDC.get(CorrelationIdFilter.MDC_KEY));

        assertFalse(visto[0].contains("\n"), "un salto de linea inyecta lineas falsas en el registro");
        assertFalse(visto[0].contains("se borro la base"));
    }

    @Test
    @DisplayName("un sello larguisimo tampoco: se descarta")
    void acotaElLargo() throws Exception {
        var req = new MockHttpServletRequest();
        req.addHeader(CorrelationIdFilter.HEADER, "x".repeat(500));
        var res = new MockHttpServletResponse();

        final String[] visto = new String[1];
        filtro.doFilter(req, res, (a, b) -> visto[0] = MDC.get(CorrelationIdFilter.MDC_KEY));

        assertTrue(visto[0].length() <= 64);
    }

    @Test
    @DisplayName("al terminar el pedido el MDC queda limpio, aunque el pedido falle")
    void noSeFiltraEntrePedidos() {
        var req = new MockHttpServletRequest();
        var res = new MockHttpServletResponse();

        FilterChain queExplota = (a, b) -> { throw new RuntimeException("algo salio mal"); };

        assertThrows(RuntimeException.class, () -> filtro.doFilter(req, res, queExplota));

        // Los hilos se reutilizan entre pedidos: si el sello sobrevive, el proximo gimnasio
        // escribe sus lineas con el sello del anterior.
        assertNull(MDC.get(CorrelationIdFilter.MDC_KEY),
                "el sello no puede sobrevivir al pedido, ni cuando hay excepcion");
    }
}
