package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.services.MolineteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * La capa que el equipo toca de verdad.
 *
 * <p>Lo frágil de acá no es la lógica sino la forma del pedido: el molinete manda <b>lo mismo
 * dos veces</b> —como query string y como JSON en el cuerpo— y arma la URL pegándole sus
 * propios parámetros a la que le configuramos. Estos tests fijan que se lea bien en las dos
 * formas, y sobre todo qué se le contesta: el equipo reintenta lo que falla, así que un 500
 * de más lo deja golpeando para siempre y un 200 de menos pierde una entrada.</p>
 */
class PublicMolineteControllerTest {

    private static final String TOKEN = "tok-de-la-puerta";
    private static final String SERIE = "E03C1CB7BBE61830";
    private static final String SOCIO = "11111111222233334444555555555555";

    private MolineteService service;
    private PublicMolineteController controller;

    @BeforeEach
    void setUp() {
        service = mock(MolineteService.class);
        controller = new PublicMolineteController(service);
        when(service.recibir(any(), any())).thenReturn(MolineteService.Resultado.REGISTRADO);
    }

    @Test
    @DisplayName("lee el aviso del cuerpo, que es la forma que documenta el fabricante")
    void leeElCuerpo() {
        var res = controller.aviso(TOKEN, Map.of(), cuerpo("face_0", "1788472566659"));

        assertEquals(200, res.getStatusCode().value());
        assertEquals(SOCIO, avisoRecibido().personId());
        assertEquals(SERIE, avisoRecibido().deviceKey());
        assertEquals("face_0", avisoRecibido().type());
    }

    /**
     * Respaldo por si un firmware manda solo la query. El equipo real manda las dos, pero el
     * documento del fabricante cubre varias familias de aparatos y no todas se comportan igual.
     */
    @Test
    @DisplayName("si el cuerpo viene vacío, lee la query string")
    void caeALaQuery() {
        Map<String, String> query = new HashMap<>();
        query.put("personId", SOCIO);
        query.put("deviceKey", SERIE);
        query.put("type", "face_1");
        query.put("time", "1788473563768");
        query.put("passTimeType", "2");

        var res = controller.aviso(TOKEN, query, null);

        assertEquals(200, res.getStatusCode().value());
        assertEquals("face_1", avisoRecibido().type());
        assertEquals("2", avisoRecibido().passTimeType());
    }

    @Test
    @DisplayName("con los dos, manda el cuerpo")
    void elCuerpoGanaALaQuery() {
        Map<String, String> query = new HashMap<>();
        query.put("type", "face_2");

        controller.aviso(TOKEN, query, cuerpo("face_0", "1788472566659"));

        assertEquals("face_0", avisoRecibido().type());
    }

    /**
     * El equipo guarda lo que no pudo entregar y lo reintenta. Un aviso sin arreglo —token que
     * no existe, socio que ya no está— tiene que salir con 200: reintentarlo mil veces no lo va
     * a mejorar, y mientras tanto le llena la cola de basura al equipo.
     */
    @Test
    @DisplayName("un aviso sin arreglo se contesta 200, no se lo deja reintentando")
    void loQueNoTieneArregloSeAcepta() {
        when(service.recibir(any(), any())).thenReturn(MolineteService.Resultado.NO_AUTORIZADO);

        var res = controller.aviso(TOKEN, Map.of(), cuerpo("face_0", "1788472566659"));

        assertEquals(200, res.getStatusCode().value());
        assertEquals("NO_AUTORIZADO", ((Map<?, ?>) res.getBody()).get("estado"));
    }

    /**
     * Y al revés: si el que falla es Veltronik, hay que pedirle al equipo que lo guarde y lo
     * mande de nuevo. Es el único caso donde reintentar arregla algo.
     */
    @Test
    @DisplayName("si falla algo nuestro, 500: que el equipo lo encole y lo reintente")
    void laFallaNuestraSeReintenta() {
        when(service.recibir(any(), any())).thenThrow(new IllegalStateException("la base se cayó"));

        var res = controller.aviso(TOKEN, Map.of(), cuerpo("face_0", "1788472566659"));

        assertEquals(500, res.getStatusCode().value());
    }

    @Test
    @DisplayName("la ráfaga normal de una puerta no toca el freno")
    void laRafagaNormalPasa() {
        for (int i = 0; i < 100; i++) {
            assertEquals(200,
                    controller.aviso(TOKEN, Map.of(), cuerpo("face_0", String.valueOf(i))).getStatusCode().value());
        }
    }

    @Test
    @DisplayName("pero una avalancha se frena, y ahí sí se deja de procesar")
    void laAvalanchaSeFrena() {
        ResponseEntity<?> ultima = null;
        for (int i = 0; i < 400; i++) {
            ultima = controller.aviso(TOKEN, Map.of(), cuerpo("face_0", String.valueOf(i)));
        }

        assertEquals(429, ultima.getStatusCode().value());
        verify(service, never()).recibir(any(), org.mockito.ArgumentMatchers.argThat(
                a -> "399".equals(a.time())));
    }

    // ─────────────────────────────────────────────────────────────────────────

    private static Map<String, Object> cuerpo(String tipo, String time) {
        Map<String, Object> body = new HashMap<>();
        body.put("personId", SOCIO);
        body.put("deviceKey", SERIE);
        body.put("type", tipo);
        body.put("time", time);
        body.put("passTimeType", "face_0".equals(tipo) ? "1" : "2");
        return body;
    }

    private MolineteService.Aviso avisoRecibido() {
        ArgumentCaptor<MolineteService.Aviso> captor =
                ArgumentCaptor.forClass(MolineteService.Aviso.class);
        verify(service, org.mockito.Mockito.atLeastOnce()).recibir(any(), captor.capture());
        return captor.getValue();
    }
}
