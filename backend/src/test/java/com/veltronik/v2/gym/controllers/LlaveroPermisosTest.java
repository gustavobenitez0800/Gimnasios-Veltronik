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
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Asignar y dar de baja un llavero es del mostrador: es ahí donde el socio lo trae o avisa que lo
 * perdió. Pasar de golpe los llaveros que vinieron en el DNI es del dueño, como el arancel masivo.
 * Se prueba por el proxy de Spring, que es donde vive el permiso.
 */
@Transactional
@DisplayName("Quién puede tocar los llaveros")
class LlaveroPermisosTest extends EmbeddedPostgresTest {

    @Autowired private LlaveroController controller;
    @Autowired private JdbcTemplate jdbc;

    private UUID socio;

    @BeforeEach
    void sembrar() {
        UUID gym = UUID.randomUUID();
        socio = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                gym, now, now, "Gimnasio con llaveros", "GYM");
        jdbc.update("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document, is_active,
                                        created_at, updated_at)
                VALUES (?, ?, 'Larissa', 'Cipriano', ?, '0012345678', true, ?, ?)
                """, socio, gym, socio + "@test.local", now, now);
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
    @DisplayName("⭐ recepción asigna y da de baja: es el mostrador")
    void recepcionAsignaYDaDeBaja() {
        como("RECEPTION");

        var asignado = controller.asignar(socio, new LlaveroController.AsignarInput("0099887766", false, "Laura"));
        assertThat(asignado.getStatusCode().value()).isEqualTo(201);

        var llavero = (com.veltronik.v2.gym.dto.LlaveroDTO) asignado.getBody().get("llavero");
        assertThat(controller.darDeBaja(llavero.id(), new LlaveroController.BajaInput("Lo perdió", "Laura"))
                .getBody().activo()).isFalse();
    }

    @Test
    @DisplayName("⭐ recepción no puede pasar de golpe los llaveros del DNI")
    void recepcionNoPasaDeGolpe() {
        como("RECEPTION");

        assertThatThrownBy(() -> controller.candidatos()).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.pasarDelDocumento(
                new LlaveroController.PasarInput(List.of(socio), null))).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("el dueño ve la lista y los pasa")
    void elDuenoLosPasa() {
        como("OWNER");

        assertThat(controller.candidatos().getBody()).extracting("socioId").containsExactly(socio);
        assertThat(controller.pasarDelDocumento(new LlaveroController.PasarInput(List.of(socio), "Gustavo"))
                .getBody()).containsEntry("pasados", 1);
    }
}
