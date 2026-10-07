package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.controllers.SesionCierreController.Pedido;
import com.veltronik.v2.core.entities.SesionCierre;
import com.veltronik.v2.core.repositories.SesionCierreRepository;
import com.veltronik.v2.core.services.SesionCierreService;
import com.veltronik.v2.core.services.SesionCierreService.Aviso;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.temporal.ChronoUnit;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Por qué se cerró cada sesión (V89).
 *
 * <p>Lo que importa acá no es que anote —eso es un INSERT— sino lo que NO puede pasar: que un
 * reintento duplique el aviso, o que un aviso mal escrito haga rebotar el pedido entero y el
 * terminal se quede reintentando para siempre una lista que nunca va a entrar.</p>
 */
@DisplayName("Por qué se cerró la sesión")
class SesionCierreIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private SesionCierreController controller;
    @Autowired private SesionCierreRepository cierres;

    private final UUID quienAvisa = UUID.randomUUID();

    @BeforeEach
    void vaciar() {
        cierres.deleteAll();
        entrarComo(quienAvisa);
    }

    @AfterEach
    void limpiarSesion() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("anota el cierre con lo que dijo el terminal y con quién lo avisó")
    void anotaElCierre() {
        UUID sello = UUID.randomUUID();
        UUID deQuienEra = UUID.randomUUID();
        LocalDateTime hace5 = LocalDateTime.now().minusMinutes(5).withNano(0);

        List<UUID> anotados = avisar("2.6.44",
                new Aviso(sello.toString(), hace5.toString(), "RESPUESTA_401", "GET /gym/access/mostrador",
                        deQuienEra.toString(), "escritorio"));

        assertThat(anotados).containsExactly(sello);
        SesionCierre guardado = cierres.findAll().get(0);
        assertThat(guardado.getClientRef()).isEqualTo(sello);
        assertThat(guardado.getOcurridoAt()).isEqualTo(hace5);
        assertThat(guardado.getMotivo()).isEqualTo("RESPUESTA_401");
        assertThat(guardado.getDetalle()).isEqualTo("GET /gym/access/mostrador");
        assertThat(guardado.getUserId()).isEqualTo(deQuienEra);
        assertThat(guardado.getPlataforma()).isEqualTo("escritorio");
        assertThat(guardado.getAppVersion()).isEqualTo("2.6.44");
        // Este sale del token, no de lo que diga el cuerpo.
        assertThat(guardado.getReportadoPor()).isEqualTo(quienAvisa);
    }

    @Test
    @DisplayName("⚠️ el mismo aviso subido dos veces queda una sola vez, y las dos veces dice que está anotado")
    void unReintentoNoDuplica() {
        Aviso aviso = aviso(UUID.randomUUID(), "SUPABASE");

        List<UUID> primera = avisar(null, aviso);
        List<UUID> segunda = avisar(null, aviso);

        assertThat(cierres.count()).isEqualTo(1);
        // El terminal borra de su lista lo que vuelve acá: si la segunda vez no volviera, lo
        // reintentaría para siempre.
        assertThat(segunda).isEqualTo(primera);
    }

    @Test
    @DisplayName("⚠️ un aviso mal escrito se descarta solo: los buenos entran igual")
    void unAvisoMaloNoTiraElPedido() {
        UUID bueno = UUID.randomUUID();
        UUID conFechaRota = UUID.randomUUID();

        List<UUID> anotados = avisar(null,
                new Aviso("esto-no-es-un-sello", null, "USUARIO", null, null, null),
                new Aviso(null, null, "USUARIO", null, null, null),
                null,
                new Aviso(conFechaRota.toString(), "ayer a la tarde", "USUARIO", null, "ni-un-uuid", null),
                aviso(bueno, "USUARIO"));

        assertThat(anotados).containsExactly(conFechaRota, bueno);
        assertThat(cierres.count()).isEqualTo(2);
        // La fecha que no se entiende pasa a ser "ahora"; el usuario que no se entiende, nadie.
        SesionCierre elDeLaFechaRota = cierres.findByClientRefIn(List.of(conFechaRota)).get(0);
        assertThat(elDeLaFechaRota.getOcurridoAt()).isCloseTo(LocalDateTime.now(), within(30, ChronoUnit.SECONDS));
        assertThat(elDeLaFechaRota.getUserId()).isNull();
    }

    @Test
    @DisplayName("el reloj del terminal se acota: ni del futuro, ni de hace más de un mes")
    void elRelojDelTerminalSeAcota() {
        UUID delFuturo = UUID.randomUUID();
        UUID viejisimo = UUID.randomUUID();
        UUID conZona = UUID.randomUUID();
        LocalDateTime ahora = LocalDateTime.now();

        avisar(null,
                new Aviso(delFuturo.toString(), ahora.plusDays(3).toString(), "USUARIO", null, null, null),
                new Aviso(viejisimo.toString(), "2019-01-01T10:00:00", "USUARIO", null, null, null),
                // Con zona también se entiende: es el mismo instante, en la hora del servidor.
                new Aviso(conZona.toString(), ahora.minusHours(2).atZone(java.time.ZoneId.systemDefault())
                        .toOffsetDateTime().toString(), "USUARIO", null, null, null));

        assertThat(deSello(delFuturo).getOcurridoAt()).isCloseTo(ahora, within(30, ChronoUnit.SECONDS));
        assertThat(deSello(viejisimo).getOcurridoAt())
                .isCloseTo(ahora.minusDays(30), within(30, ChronoUnit.SECONDS));
        assertThat(deSello(conZona).getOcurridoAt())
                .isCloseTo(ahora.minusHours(2), within(30, ChronoUnit.SECONDS));
    }

    @Test
    @DisplayName("lo largo se recorta y un motivo vacío queda como OTRO")
    void recortaLoLargo() {
        UUID sello = UUID.randomUUID();

        avisar("v".repeat(80), new Aviso(sello.toString(), null, "   ", "x".repeat(900), null, "p".repeat(60)));

        SesionCierre guardado = deSello(sello);
        assertThat(guardado.getMotivo()).isEqualTo("OTRO");
        assertThat(guardado.getDetalle()).hasSize(500);
        assertThat(guardado.getAppVersion()).hasSize(32);
        assertThat(guardado.getPlataforma()).hasSize(20);
    }

    @Test
    @DisplayName("un pedido no anota más de veinte, ni repite un sello que viene dos veces")
    void topeYRepetidos() {
        List<Aviso> muchos = new ArrayList<>();
        UUID repetido = UUID.randomUUID();
        muchos.add(aviso(repetido, "USUARIO"));
        muchos.add(aviso(repetido, "USUARIO"));
        for (int i = 0; i < 30; i++) muchos.add(aviso(UUID.randomUUID(), "USUARIO"));

        List<UUID> anotados = avisar(null, muchos.toArray(new Aviso[0]));

        assertThat(anotados).hasSize(SesionCierreService.MAXIMO_POR_PEDIDO).doesNotHaveDuplicates();
        assertThat(cierres.count()).isEqualTo(SesionCierreService.MAXIMO_POR_PEDIDO);
    }

    @Test
    @DisplayName("sin sesión no se anota nada")
    void sinSesionNoAnota() {
        SecurityContextHolder.clearContext();

        ResponseEntity<?> respuesta = controller.avisar(new Pedido(List.of(aviso(UUID.randomUUID(), "USUARIO"))), null);

        assertThat(respuesta.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(cierres.count()).isZero();
    }

    @Test
    @DisplayName("un pedido vacío o sin cuerpo no es un error")
    void pedidoVacio() {
        assertThat(controller.avisar(null, null).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(controller.avisar(new Pedido(null), null).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(cierres.count()).isZero();
    }

    // ─────────────────────────── ayudas ───────────────────────────

    private static Aviso aviso(UUID sello, String motivo) {
        return new Aviso(sello.toString(), LocalDateTime.now().minusMinutes(1).toString(), motivo, null, null, "escritorio");
    }

    @SuppressWarnings("unchecked")
    private List<UUID> avisar(String appVersion, Aviso... avisos) {
        ResponseEntity<?> respuesta = controller.avisar(new Pedido(Arrays.asList(avisos)), appVersion);
        assertThat(respuesta.getStatusCode()).isEqualTo(HttpStatus.OK);
        return (List<UUID>) ((Map<String, Object>) respuesta.getBody()).get("anotados");
    }

    private SesionCierre deSello(UUID sello) {
        return cierres.findByClientRefIn(List.of(sello)).get(0);
    }

    private void entrarComo(UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "ES256").subject(userId.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }
}
