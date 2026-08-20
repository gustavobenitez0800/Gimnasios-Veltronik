package com.veltronik.v2.core.services;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regresión del bug "El registro ya existe o está vinculado a otros datos" al eliminar
 * un negocio desde el Lobby.
 *
 * <p><b>El bug:</b> {@code TenantService.delete} borraba una lista FIJA de tablas hijas.
 * Hubo tablas que referenciaban {@code tenant} sin {@code ON DELETE CASCADE}
 * y no estaba en la lista → la FK rechazaba el borrado → 409 para el cliente. Cada tabla
 * nueva con {@code tenant_id} podía reintroducir el mismo bug.</p>
 *
 * <p><b>El fix que este test protege:</b> el borrado descubre las tablas dinámicamente
 * ({@code information_schema}) — acá se siembra un negocio CON cajero y membresía
 * (las dos tablas sin cascade) y se verifica que el borrado se lleva todo.</p>
 *
 * <p>Corre contra PostgreSQL embebida real (mismo arnés que {@code ApplicationBootTest})
 * porque el fix es PL/pgSQL puro: un mock no probaría nada.</p>
 */
@SpringBootTest
class TenantDeleteIntegrationTest {

    private static EmbeddedPostgres postgres;

    @Autowired
    private TenantService tenantService;

    @Autowired
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) throws Exception {
        postgres = EmbeddedPostgres.builder().start();
        // Stub del esquema 'auth' de Supabase (V11/V17 lo referencian; acá no se usa).
        try (Connection c = postgres.getPostgresDatabase().getConnection();
             Statement st = c.createStatement()) {
            st.execute("CREATE SCHEMA IF NOT EXISTS auth");
            st.execute("CREATE TABLE IF NOT EXISTS auth.users ("
                    + "id uuid PRIMARY KEY, email varchar(255), raw_user_meta_data jsonb)");
        }
        registry.add("spring.datasource.url", () -> postgres.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "postgres");
        registry.add("SUPABASE_URL", () -> "https://dummy.supabase.co");
        registry.add("MP_ACCESS_TOKEN", () -> "TEST-dummy");
        registry.add("MP_PUBLIC_KEY", () -> "TEST-dummy");
        registry.add("MP_WEBHOOK_SECRET", () -> "dummy");
    }

    @AfterAll
    static void stopPostgres() throws IOException {
        if (postgres != null) postgres.close();
    }

    @Test
    void borraElNegocioConCajerosYMembresias_sin409() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();

        // Un negocio con las DOS tablas hijas sin ON DELETE CASCADE que rompían el borrado:
        // tenant_membership (V1).
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                tenantId, now, now, "Negocio de prueba", "GYM");
        // app_user sin password_hash: V11 la eliminó al delegar la autenticación a Supabase.
        jdbc.update("INSERT INTO app_user (id, created_at, updated_at, email) VALUES (?,?,?,?)",
                userId, now, now, "test-delete@veltronik.com");
        jdbc.update("INSERT INTO tenant_membership (id, created_at, updated_at, user_id, tenant_id, role) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), now, now, userId, tenantId, "OWNER");

        tenantService.delete(tenantId);

        assertThat(count("tenant", "id", tenantId)).isZero();
        assertThat(count("tenant_membership", "tenant_id", tenantId)).isZero();
        // El usuario NO se borra: puede ser dueño de otros negocios.
        assertThat(count("app_user", "id", userId)).isEqualTo(1);
    }

    @Test
    void borrarElNegocioSUELTAsusEquipos_paraQueElTerminalNoQuedeInservible() {
        // El bug: la purga borra por columna `tenant_id`, y device_registry usa
        // `enrolled_tenant_id` (es flota, no datos del negocio). Los terminales quedaban
        // atados a una sucursal que ya no existía: al arrancar, la app decía "este equipo
        // pertenece a otra sucursal" y no dejaba entrar a ninguna. Apareció en una máquina
        // real apenas salió la 2.6.7.
        UUID tenantId = UUID.randomUUID();
        UUID terminal = UUID.randomUUID();
        UUID otroTerminal = UUID.randomUUID();
        UUID tenantAjeno = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();

        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                tenantId, now, now, "Sucursal que se borra", "GYM");
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                tenantAjeno, now, now, "Sucursal que sigue viva", "GYM");

        // Un terminal enrolado a la sucursal condenada...
        jdbc.update("INSERT INTO device_registry (id, created_at, updated_at, last_seen_at, "
                        + "enrolled_tenant_id, last_tenant_id, status, display_name) VALUES (?,?,?,?,?,?,?,?)",
                terminal, now, now, now, tenantId, tenantId, "ACTIVE", "Recepción");
        // ...y otro de una sucursal distinta, que NO se tiene que tocar.
        jdbc.update("INSERT INTO device_registry (id, created_at, updated_at, last_seen_at, "
                        + "enrolled_tenant_id, last_tenant_id, status, display_name) VALUES (?,?,?,?,?,?,?,?)",
                otroTerminal, now, now, now, tenantAjeno, tenantAjeno, "ACTIVE", "Mostrador ajeno");

        tenantService.delete(tenantId);

        assertThat(count("tenant", "id", tenantId)).isZero();

        // El equipo NO se borra —su DNI y su historial quedan, los registros viejos lo
        // referencian por origin_device_id— pero se suelta: revocado y sin punteros a un
        // negocio fantasma. Así vuelve a poder activarse en cualquier sucursal.
        Map<String, Object> liberado = jdbc.queryForMap(
                "SELECT status, enrolled_tenant_id, last_tenant_id FROM device_registry WHERE id = ?", terminal);
        assertThat(liberado.get("status")).isEqualTo("REVOKED");
        assertThat(liberado.get("enrolled_tenant_id")).isNull();
        assertThat(liberado.get("last_tenant_id")).isNull();

        // El de la otra sucursal quedó intacto.
        Map<String, Object> intacto = jdbc.queryForMap(
                "SELECT status, enrolled_tenant_id FROM device_registry WHERE id = ?", otroTerminal);
        assertThat(intacto.get("status")).isEqualTo("ACTIVE");
        assertThat(intacto.get("enrolled_tenant_id")).isEqualTo(tenantAjeno);
    }

    private long count(String table, String column, UUID value) {
        Long n = jdbc.queryForObject(
                "SELECT count(*) FROM " + table + " WHERE " + column + " = ?", Long.class, value);
        return n == null ? 0 : n;
    }
}
