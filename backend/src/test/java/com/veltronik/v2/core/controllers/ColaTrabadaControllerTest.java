package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.controllers.ColaTrabadaController.Aviso;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * El aviso de cola trabada deja UNA línea de error con la marca que busca la alerta.
 *
 * <p>Es todo lo que hace, y por eso es lo que se prueba: que la línea salga, que diga de qué
 * gimnasio es, y que nada de lo que mande el terminal pueda romperla o falsificarla.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
class ColaTrabadaControllerTest {

    private final TenantRepository gimnasios = mock(TenantRepository.class);
    private final ColaTrabadaController controller = new ColaTrabadaController(gimnasios);
    private final UUID gym = UUID.randomUUID();

    @BeforeEach
    void entrar() {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "ES256").subject(UUID.randomUUID().toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));

        Tenant santoSport = new Tenant();
        santoSport.setName("Santo Sport Gym");
        when(gimnasios.findById(gym)).thenReturn(Optional.of(santoSport));
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void salir() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    @Test
    @DisplayName("⭐ deja la línea con la marca, el gimnasio y qué traba la cola")
    void dejaLaLinea(CapturedOutput salida) {
        var r = controller.avisar(new Aviso("139", "2026-10-05T19:47:13", "ALTA", "500", "288",
                "HTTP 500 x288 · could not initialize proxy"), "2.6.45");

        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(salida.getOut())
                .contains(ColaTrabadaController.MARCA)
                .contains("Santo Sport Gym")
                .contains(gym.toString())
                .contains("139 movimientos esperando desde 2026-10-05T19:47:13")
                .contains("el primero es ALTA y el servidor le contesta 500")
                .contains("could not initialize proxy");
    }

    @Test
    @DisplayName("un aviso vacío o a medias igual avisa: es mejor una línea pobre que ninguna")
    void unAvisoVacioIgualAvisa(CapturedOutput salida) {
        assertThat(controller.avisar(null, null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(controller.avisar(new Aviso(null, null, null, null, null, null), null).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);

        assertThat(salida.getOut()).contains(ColaTrabadaController.MARCA);
    }

    @Test
    @DisplayName("sin sucursal en el pedido lo dice, en vez de romperse")
    void sinSucursal(CapturedOutput salida) {
        TenantContextHolder.clear();

        controller.avisar(new Aviso("3", null, "COBRO", "500", "3", "x"), "2.6.45");

        assertThat(salida.getOut()).contains("gimnasio 'sin sucursal'");
    }

    @Test
    @DisplayName("⚠️ un salto de línea en el mensaje no puede escribir líneas de registro falsas")
    void noSePuedenFalsificarLineas(CapturedOutput salida) {
        controller.avisar(new Aviso("1", null, "ALTA", "500", "3",
                "algo\n2026-10-07 ERROR " + ColaTrabadaController.MARCA + " · gimnasio 'Otro'"), "2.6.45");

        long lineasConLaMarca = salida.getOut().lines()
                .filter(l -> l.contains(ColaTrabadaController.MARCA)).count();
        assertThat(lineasConLaMarca).isEqualTo(1);
    }

    @Test
    @DisplayName("un mensaje enorme se recorta: el registro no es un lugar para volcar cualquier cosa")
    void seRecorta(CapturedOutput salida) {
        controller.avisar(new Aviso("1", null, "ALTA", "500", "3", "x".repeat(5000)), "2.6.45");

        assertThat(salida.getOut()).doesNotContain("x".repeat(400));
    }

    @Test
    @DisplayName("sin sesión no anota nada")
    void sinSesion(CapturedOutput salida) {
        SecurityContextHolder.clearContext();

        var r = controller.avisar(new Aviso("1", null, "ALTA", "500", "3", "x"), "2.6.45");

        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(salida.getOut()).doesNotContain(ColaTrabadaController.MARCA);
    }
}
