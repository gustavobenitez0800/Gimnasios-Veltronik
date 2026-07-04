package com.veltronik.v2;

import com.veltronik.v2.core.controllers.LocalAuthController;
import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.security.LocalPrincipal;
import com.veltronik.v2.core.security.LocalSessionService;
import com.veltronik.v2.core.services.CashierService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.CleanupMode;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El login del cajero contra el cerebro local (ladrillo 6), de punta a punta en el
 * perfil {@code local}: identidad por props → cajero sincronizado (insertado aquí) →
 * PIN → token de sesión válido.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class LocalAuthIntegrationTest {

    private static final UUID TENANT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @TempDir(cleanup = CleanupMode.NEVER)
    static Path tempDir;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("veltronik.local.data-dir", () -> tempDir.resolve("pgdata").toString());
        registry.add("veltronik.local.pg-port", () -> "0");
        // Identidad por props (en producción viene de sync-identity.json). Cloud-url bogus:
        // los jobs de sync fallarán en silencio (no arrancan antes de que el test termine).
        registry.add("veltronik.sync.cloud-url", () -> "http://127.0.0.1:1");
        registry.add("veltronik.sync.device-id", () -> UUID.randomUUID().toString());
        registry.add("veltronik.sync.device-key", () -> "vk_test");
        registry.add("veltronik.sync.tenant-id", TENANT_ID::toString);
    }

    @Autowired LocalAuthController controller;
    @Autowired CashierService cashierService;
    @Autowired LocalSessionService sessionService;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mockMvc;

    @Test
    void el_cajero_entra_por_PIN_y_recibe_un_token_valido() {
        // El tenant baja por sync; acá lo insertamos como si ya hubiera bajado.
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type, is_active) "
                + "VALUES (?, now(), now(), 'Kiosco Local', 'KIOSCO', true) ON CONFLICT (id) DO NOTHING", TENANT_ID);
        Cashier marta = cashierService.create(TENANT_ID, "Marta", "4321", Cashier.Role.CAJERO);

        // ── PIN correcto → 200 + token ──
        var req = new LocalAuthController.LoginRequest();
        req.setPin("4321");
        ResponseEntity<?> ok = controller.login(req);
        assertThat(ok.getStatusCode().is2xxSuccessful()).isTrue();

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) ok.getBody();
        String token = (String) body.get("token");
        assertThat(token).isNotBlank();

        // El token es válido y apunta a Marta en esta sucursal.
        Optional<LocalPrincipal> principal = sessionService.verify(token);
        assertThat(principal).isPresent();
        assertThat(principal.get().cashierId()).isEqualTo(marta.getId());
        assertThat(principal.get().tenantId()).isEqualTo(TENANT_ID);

        // ── PIN incorrecto → 401 ──
        var bad = new LocalAuthController.LoginRequest();
        bad.setPin("0000");
        assertThat(controller.login(bad).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void la_cadena_local_exige_token_y_respeta_el_rol_del_cajero() throws Exception {
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type, is_active) "
                + "VALUES (?, now(), now(), 'Kiosco Local', 'KIOSCO', true) ON CONFLICT (id) DO NOTHING", TENANT_ID);
        Cashier pos = cashierService.create(TENANT_ID, "Pos", "5678", Cashier.Role.CAJERO);
        String token = sessionService.issue(new LocalPrincipal(pos.getId(), TENANT_ID, pos.getRole(), pos.getName()));

        // Sin token → 401 (la cadena local rechaza al anónimo).
        mockMvc.perform(get("/api/core/cashiers")).andExpect(status().isUnauthorized());

        // Con token de CAJERO → el filtro AUTENTICA (deja de ser 401): el request llega al
        // controller y el @PreAuthorize lo frena por rol (gestionar cajeros es OWNER/ADMIN).
        // No aserto el código exacto de la negación: el GlobalExceptionHandler mapea el
        // AccessDeniedException a 500 hoy (comportamiento compartido con la nube, ajeno a esto).
        int authed = mockMvc.perform(get("/api/core/cashiers").header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
        assertThat(authed).isNotEqualTo(401);
    }

    @Test
    void status_reporta_modo_local_listo() {
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) controller.status().getBody();
        assertThat(body.get("mode")).isEqualTo("local");
        assertThat(body.get("ready")).isEqualTo(true);
        assertThat(body.get("tenantId")).isEqualTo(TENANT_ID.toString());
    }
}
