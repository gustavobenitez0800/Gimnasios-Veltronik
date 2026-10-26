package com.veltronik.v2.core.services;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cómo viaja la clave de servicio según su clase: la vieja (JWT) en {@code apikey} y como
 * Bearer; la nueva ({@code sb_secret_…}) SOLO en {@code apikey}, como pide Supabase.
 *
 * <p>Se le pega a un servidor HTTP local que hace de Supabase y guarda los encabezados del
 * último pedido: así se prueba lo que sale de verdad por la red, no un armado intermedio.</p>
 */
class SupabaseAdminServiceTest {

    private static final String CLAVE_VIEJA = "eyJhbGciOiJIUzI1NiJ9.de-mentira.firma";
    private static final String CLAVE_NUEVA = "sb_secret_de-mentira";

    private HttpServer supabase;
    private volatile Headers recibidos;
    private volatile String metodo;

    @BeforeEach
    void levantarSupabaseDeMentira() throws Exception {
        supabase = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        supabase.createContext("/auth/v1/admin/users", intercambio -> {
            recibidos = intercambio.getRequestHeaders();
            metodo = intercambio.getRequestMethod();
            byte[] cuerpo = ("{\"id\":\"" + UUID.randomUUID() + "\"}").getBytes(StandardCharsets.UTF_8);
            intercambio.sendResponseHeaders(200, cuerpo.length);
            try (OutputStream salida = intercambio.getResponseBody()) {
                salida.write(cuerpo);
            }
        });
        supabase.start();
    }

    @AfterEach
    void apagar() {
        supabase.stop(0);
    }

    private SupabaseAdminService servicioCon(String clave) {
        return new SupabaseAdminService("http://127.0.0.1:" + supabase.getAddress().getPort(), clave);
    }

    @Test
    @DisplayName("la clave vieja viaja en apikey y como Bearer, igual que siempre")
    void clave_vieja_en_los_dos_encabezados() {
        servicioCon(CLAVE_VIEJA).createUser("ana@ejemplo.com", "Ana Pérez");

        assertThat(recibidos.getFirst("apikey")).isEqualTo(CLAVE_VIEJA);
        assertThat(recibidos.getFirst("Authorization")).isEqualTo("Bearer " + CLAVE_VIEJA);
    }

    @Test
    @DisplayName("la clave nueva viaja solo en apikey al crear un usuario")
    void clave_nueva_sin_bearer_al_crear() {
        servicioCon(CLAVE_NUEVA).createUser("ana@ejemplo.com", "Ana Pérez");

        assertThat(metodo).isEqualTo("POST");
        assertThat(recibidos.getFirst("apikey")).isEqualTo(CLAVE_NUEVA);
        assertThat(recibidos.containsKey("Authorization")).isFalse();
    }

    @Test
    @DisplayName("la clave nueva viaja solo en apikey al borrar un usuario")
    void clave_nueva_sin_bearer_al_borrar() {
        servicioCon(CLAVE_NUEVA).deleteUser(UUID.randomUUID());

        assertThat(metodo).isEqualTo("DELETE");
        assertThat(recibidos.getFirst("apikey")).isEqualTo(CLAVE_NUEVA);
        assertThat(recibidos.containsKey("Authorization")).isFalse();
    }

    @Test
    @DisplayName("distingue las dos clases de clave por cómo empiezan")
    void reconoce_la_clase_de_clave() {
        assertThat(SupabaseAdminService.esClaveVieja(CLAVE_VIEJA)).isTrue();
        assertThat(SupabaseAdminService.esClaveVieja(CLAVE_NUEVA)).isFalse();
    }
}
