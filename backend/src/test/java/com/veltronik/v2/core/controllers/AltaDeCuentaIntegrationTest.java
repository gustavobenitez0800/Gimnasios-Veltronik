package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.BusinessType;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * El alta de una cuenta nueva, de punta a punta del lado de la base.
 *
 * <p><b>Por qué existe.</b> Hasta el 2026-09-19 {@code SetupController.createTenant} —la puerta
 * de entrada de todo el negocio— no tenía un solo test. Tampoco se había probado a mano desde
 * que se cerró el RLS (6/9), y en el medio pasaron quince migraciones que renombraron tablas.
 * Era el camino más importante del sistema y el menos protegido.</p>
 *
 * <p><b>Qué cubre que un mock no cubriría.</b> El usuario se siembra insertando en
 * {@code auth.users}, no en {@code app_user}: así corre el trigger {@code on_auth_user_created}
 * de verdad, el mismo que en Supabase. Si una migración futura renombra {@code app_user} o una
 * de sus columnas y se olvida de la función, el alta en producción se rompe EN SILENCIO —el
 * usuario se registra, entra, y recién al crear el gimnasio recibe "Usuario no encontrado"—.
 * Acá se rompe el build.</p>
 *
 * <p><b>Lo que NO puede ver.</b> La configuración de Supabase Auth (confirmación de mail,
 * proveedores), ni el estado real del trigger en producción si alguien lo editó a mano desde
 * el panel. Para eso sigue haciendo falta la prueba manual con una cuenta real.</p>
 */
@DisplayName("Alta de cuenta nueva")
class AltaDeCuentaIntegrationTest extends EmbeddedPostgresTest {

    private static final ZoneId AR = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired private SetupController setup;
    @Autowired private AppUserRepository users;
    @Autowired private TenantRepository tenants;
    @Autowired private TenantMembershipRepository memberships;
    @Autowired private JdbcTemplate jdbc;

    @AfterEach
    void limpiarSesion() {
        SecurityContextHolder.clearContext();
    }

    @Nested
    @DisplayName("el trigger de auth.users")
    class ElTrigger {

        @Test
        @DisplayName("con email y contraseña: crea la ficha con nombre y apellido")
        void conEmailYContrasena() {
            // Es lo que manda AuthService.signUp: first_name y last_name ya separados.
            UUID id = registrarEnAuth("ana+" + UUID.randomUUID() + "@test.com",
                    "{\"first_name\":\"Ana\",\"last_name\":\"Gómez\"}");

            AppUser u = users.findById(id).orElseThrow();
            assertThat(u.getFirstName()).isEqualTo("Ana");
            assertThat(u.getLastName()).isEqualTo("Gómez");
        }

        @Test
        @DisplayName("⭐ con Google: saca el nombre de full_name")
        void conGoogle() {
            // Google NO manda first_name/last_name: manda full_name (y name). La V17 lo resolvía;
            // la V48 reescribió la función para limpiar fichas huérfanas y volvió a leer solo
            // first_name/last_name. Desde entonces, todo el que entraba con Google quedaba SIN
            // NOMBRE en app_user, y la pantalla de Equipo lo mostraba en blanco.
            UUID id = registrarEnAuth("beto+" + UUID.randomUUID() + "@gmail.com",
                    "{\"full_name\":\"Roberto Carlos Díaz\",\"name\":\"Roberto Carlos Díaz\"}");

            AppUser u = users.findById(id).orElseThrow();
            assertThat(u.getFirstName()).isEqualTo("Roberto");
            assertThat(u.getLastName()).isEqualTo("Carlos Díaz");
        }

        @Test
        @DisplayName("sin ningún nombre en la metadata: la ficha se crea igual")
        void sinNombre() {
            // El alta no puede fallar por un dato cosmético.
            UUID id = registrarEnAuth("nn+" + UUID.randomUUID() + "@test.com", "{}");
            assertThat(users.findById(id)).isPresent();
        }
    }

    @Nested
    @DisplayName("crear el gimnasio")
    class CrearElGimnasio {

        @Test
        @DisplayName("la primera sucursal tiene 14 días de prueba y el usuario queda como dueño")
        void primeraSucursal() {
            UUID userId = registrarYEntrar();

            Map<String, Object> body = crear("Gimnasio Uno");

            assertThat(body.get("is_first_branch")).isEqualTo(true);
            UUID tenantId = (UUID) body.get("tenant_id");
            Tenant t = tenants.findById(tenantId).orElseThrow();

            LocalDateTime esperado = LocalDateTime.now(AR).plusDays(14);
            assertThat(Duration.between(t.getTrialEndsAt(), esperado).abs())
                    .as("la prueba vence en 14 días, en hora argentina")
                    .isLessThan(Duration.ofMinutes(1));
            // La respuesta lleva la fecha en memoria (nanosegundos) y Postgres guarda
            // microsegundos: se compara con tolerancia, no con igualdad exacta.
            LocalDateTime enLaRespuesta = (LocalDateTime) body.get("trial_ends_at");
            assertThat(Duration.between(enLaRespuesta, t.getTrialEndsAt()).abs())
                    .isLessThan(Duration.ofMillis(1));
            assertThat(t.isActive()).isTrue();
            assertThat(t.getBusinessType()).isEqualTo(BusinessType.GYM);

            List<TenantMembership> suyas = memberships.findByUserId(userId);
            assertThat(suyas).hasSize(1);
            assertThat(suyas.get(0).getRole()).isEqualTo(UserRole.OWNER);
            assertThat(suyas.get(0).isActive()).isTrue();
            assertThat(suyas.get(0).getTenant().getId()).isEqualTo(tenantId);
        }

        @Test
        @DisplayName("⭐ la segunda sucursal NO tiene prueba, y la respuesta no explota con el null")
        void segundaSucursal() {
            // Es el camino de un cliente multi-sede. Si la segunda recibiera 14 días, a un
            // gimnasio de tres sedes se le regalarían dos meses de dos sucursales.
            registrarYEntrar();
            crear("Sede Centro");

            Map<String, Object> body = crear("Sede Norte");

            assertThat(body.get("is_first_branch")).isEqualTo(false);
            // Está en la respuesta Y vale null. Con Map.of esto tiraba NullPointerException:
            // 400, rollback, y la sucursal no se creaba.
            assertThat(body).containsKey("trial_ends_at");
            assertThat(body.get("trial_ends_at")).isNull();

            Tenant t = tenants.findById((UUID) body.get("tenant_id")).orElseThrow();
            assertThat(t.getTrialEndsAt()).isNull();
        }

        @Test
        @DisplayName("el navegador no puede regalarse prueba, elegir id ni cambiar el rubro")
        void sinMassAssignment() {
            registrarYEntrar();
            UUID idAjeno = UUID.randomUUID();

            TenantDTO dto = new TenantDTO();
            dto.setName("Gimnasio Vivo");
            dto.setId(idAjeno);
            dto.setTrialEndsAt(LocalDateTime.of(2099, 1, 1, 0, 0));
            ResponseEntity<?> r = setup.createTenant(dto);

            @SuppressWarnings("unchecked")
            Map<String, Object> body = (Map<String, Object>) r.getBody();
            UUID tenantId = (UUID) body.get("tenant_id");
            assertThat(tenantId).isNotEqualTo(idAjeno);
            Tenant t = tenants.findById(tenantId).orElseThrow();
            assertThat(t.getTrialEndsAt().getYear()).isLessThan(2099);
        }

        @Test
        @DisplayName("sin sesión: 401")
        void sinSesion() {
            TenantDTO dto = new TenantDTO();
            dto.setName("Nadie");
            assertThat(setup.createTenant(dto).getStatusCode().value()).isEqualTo(401);
        }

        @Test
        @DisplayName("con sesión pero sin ficha en app_user: 404 y no se crea nada")
        void sinFicha() {
            // Es el síntoma de un trigger roto: Supabase dio de alta al usuario y el backend
            // no lo encuentra. Que sea un 404 claro y no un gimnasio huérfano sin dueño.
            UUID fantasma = UUID.randomUUID();
            entrarComo(fantasma);
            TenantDTO dto = new TenantDTO();
            dto.setName("Huérfano");

            assertThat(setup.createTenant(dto).getStatusCode().value()).isEqualTo(404);
            assertThat(memberships.findByUserId(fantasma)).isEmpty();
        }
    }

    // ── Ayudas ─────────────────────────────────────────────────────────────────

    /** Inserta en auth.users como lo haría Supabase: el trigger arma la ficha de app_user. */
    private UUID registrarEnAuth(String email, String metadata) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (?, ?, ?::jsonb)",
                id, email, metadata);
        return id;
    }

    private UUID registrarYEntrar() {
        UUID id = registrarEnAuth("duenio+" + UUID.randomUUID() + "@test.com",
                "{\"first_name\":\"Duenio\",\"last_name\":\"Prueba\"}");
        entrarComo(id);
        return id;
    }

    private void entrarComo(UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "ES256").subject(userId.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> crear(String nombre) {
        TenantDTO dto = new TenantDTO();
        dto.setName(nombre);
        ResponseEntity<?> r = setup.createTenant(dto);
        assertThat(r.getStatusCode().value()).as("crear '%s'", nombre).isEqualTo(200);
        return (Map<String, Object>) r.getBody();
    }
}
