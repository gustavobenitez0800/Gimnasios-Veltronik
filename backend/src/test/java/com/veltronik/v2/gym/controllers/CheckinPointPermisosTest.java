package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El QR de la entrada se muestra en el mostrador (2026-09-22): recepción lo puede VER, pero
 * crearlo o rotarlo sigue siendo del dueño. Se prueba por el proxy de Spring, que es donde
 * vive el permiso: la anotación de la clase se sacó y cada método dice el suyo.
 */
@DisplayName("Quién puede ver y quién puede cambiar el cartel del QR")
class CheckinPointPermisosTest extends EmbeddedPostgresTest {

    @Autowired private CheckinPointController controller;
    @Autowired private JdbcTemplate jdbc;

    private UUID gym;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                gym, now, now, "Gimnasio QR", "GYM");
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    private void como(String rol) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "alguien", null, List.of(new SimpleGrantedAuthority("ROLE_" + rol))));
    }

    @Test
    @DisplayName("⭐ recepción ve el cartel vigente, y nada más que el código")
    void recepcionLoVe() {
        como("OWNER");
        controller.crear(null);

        como("RECEPTION");
        var r = controller.activo();

        assertThat(r.getStatusCode().value()).isEqualTo(200);
        assertThat(r.getBody()).containsOnlyKeys("token");
    }

    @Test
    @DisplayName("⭐ recepción no puede listar, crear ni rotar el cartel")
    void recepcionNoLoCambia() {
        como("RECEPTION");

        assertThatThrownBy(() -> controller.listar()).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.crear(null)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("sin cartel creado, responde que no hay (204), no un error")
    void sinCartel() {
        como("RECEPTION");
        assertThat(controller.activo().getStatusCode().value()).isEqualTo(204);
    }
}
