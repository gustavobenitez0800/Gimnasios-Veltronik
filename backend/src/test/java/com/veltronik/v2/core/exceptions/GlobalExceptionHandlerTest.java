package com.veltronik.v2.core.exceptions;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Un pedido mal armado (ruta que no existe, método equivocado) es un error del que pide, no
 * del servidor. Hasta el 2026-11-01 todos caían al 500 genérico: un GET a una ruta inexistente
 * dejaba un ERROR con el stack en el registro, y la cola del escritorio reintenta un 5xx.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    private static MockHttpServletRequest pedido(String metodo, String ruta) {
        return new MockHttpServletRequest(metodo, ruta);
    }

    @Test
    void una_ruta_que_no_existe_es_404_y_no_500() {
        var r = handler.handleRequestMalArmado(
                new NoResourceFoundException(HttpMethod.GET, "api/public/no-existe"), pedido("GET", "/api/public/no-existe"));
        assertEquals(404, r.getStatusCode().value());
        assertEquals("/api/public/no-existe", r.getBody().getPath());
    }

    @Test
    void un_metodo_equivocado_es_405() {
        var r = handler.handleRequestMalArmado(
                new HttpRequestMethodNotSupportedException("GET", List.of("POST")), pedido("GET", "/api/public/checkin/estado"));
        assertEquals(405, r.getStatusCode().value());
    }

    @Test
    void un_tipo_de_contenido_que_no_corresponde_es_415() {
        var r = handler.handleRequestMalArmado(
                new HttpMediaTypeNotSupportedException(MediaType.TEXT_PLAIN, List.of(MediaType.APPLICATION_JSON)),
                pedido("POST", "/api/public/checkin"));
        assertEquals(415, r.getStatusCode().value());
    }

    @Test
    void un_parametro_que_falta_es_400() {
        var r = handler.handleRequestMalArmado(
                new MissingServletRequestParameterException("desde", "LocalDate"), pedido("GET", "/api/gym/caja/reporte"));
        assertEquals(400, r.getStatusCode().value());
    }

    @Test
    void un_error_de_verdad_sigue_siendo_500() {
        var r = handler.handleGlobalException(new IllegalStateException("se rompió algo"), pedido("GET", "/api/gym/members"));
        assertEquals(500, r.getStatusCode().value());
    }
}
