package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.CoverageGapDTO;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La consulta que arma la lista de "socios que pagaron y figuran vencidos", contra
 * PostgreSQL de verdad.
 *
 * <p><b>Por qué no alcanza con un mock.</b> Un JPQL que PARSEA al arrancar igual puede
 * explotar al ejecutarse: el {@code GROUP BY} con {@code HAVING} sobre una columna
 * agregada es exactamente el tipo de cosa que Hibernate acepta y Postgres rechaza. Y en
 * este caso el fallo sería mudo: la pantalla de Ajustes se traga el error y no dibuja la
 * sección, así que la herramienta simplemente "no existiría" y nadie se enteraría.</p>
 *
 * <p>Mismo arnés que {@code TenantDeleteIntegrationTest}.</p>
 */
@SpringBootTest
class CoverageGapsIntegrationTest {

    private static EmbeddedPostgres postgres;

    @Autowired
    private GymPaymentService paymentService;

    @Autowired
    private JdbcTemplate jdbc;

    private final UUID tenantId = UUID.randomUUID();

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

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    // ── Siembra ────────────────────────────────────────────────────────────────

    private void crearSucursal() {
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                tenantId, now, now, "Gimnasio de prueba", "GYM");
        TenantContextHolder.setTenantId(tenantId);
    }

    private UUID crearSocio(String nombre, LocalDateTime cubiertoHasta) {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO gym_members (id, created_at, updated_at, tenant_id, first_name, last_name, "
                        + "email, is_active, membership_end) VALUES (?,?,?,?,?,?,?,?,?)",
                id, now, now, tenantId, nombre, "Apellido", nombre.toLowerCase() + "@test.com", true, cubiertoHasta);
        return id;
    }

    private void crearPago(UUID socioId, String status, LocalDateTime cubreHasta) {
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO gym_payments (id, created_at, updated_at, tenant_id, member_id, amount, "
                        + "payment_date, status, period_end) VALUES (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), now, now, tenantId, socioId, new BigDecimal("30000"), now, status, cubreHasta);
    }

    // ── El test ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("La consulta corre contra Postgres y encuentra exactamente a quien pagó de más")
    void encuentraSoloALosQuePagaronDeMas() {
        crearSucursal();

        // Pagó hasta septiembre pero figura vencido en marzo → ESTE es el caso a encontrar.
        UUID huerfano = crearSocio("Huerfano", LocalDateTime.of(2026, 3, 31, 23, 59));
        crearPago(huerfano, "paid", LocalDateTime.of(2026, 9, 30, 23, 59));

        // Al día: su pago coincide con su cobertura → no aparece.
        UUID alDia = crearSocio("AlDia", LocalDateTime.of(2026, 9, 30, 23, 59));
        crearPago(alDia, "paid", LocalDateTime.of(2026, 9, 30, 23, 59));

        // Debe plata: venció y no pagó nada más → no aparece (no es huérfano, es moroso).
        UUID moroso = crearSocio("Moroso", LocalDateTime.of(2026, 3, 31, 23, 59));
        crearPago(moroso, "paid", LocalDateTime.of(2026, 3, 31, 23, 59));

        // Tiene un pago PENDIENTE que cubriría más: no cuenta, la plata no entró.
        UUID pendiente = crearSocio("Pendiente", LocalDateTime.of(2026, 3, 31, 23, 59));
        crearPago(pendiente, "pending", LocalDateTime.of(2026, 12, 31, 23, 59));

        // Nunca tuvo fecha de cobertura pero pagó: también hay que corregirlo.
        UUID sinFecha = crearSocio("SinFecha", null);
        crearPago(sinFecha, "paid", LocalDateTime.of(2026, 9, 30, 23, 59));

        List<CoverageGapDTO> gaps = paymentService.findCoverageGaps();

        assertThat(gaps).extracting(CoverageGapDTO::getMemberId)
                .containsExactlyInAnyOrder(huerfano, sinFecha);

        CoverageGapDTO fila = gaps.stream().filter(g -> g.getMemberId().equals(huerfano)).findFirst().orElseThrow();
        assertThat(fila.getMemberName()).isEqualTo("Huerfano Apellido");
        assertThat(fila.getPaidUntil()).isEqualTo(LocalDateTime.of(2026, 9, 30, 23, 59));
        assertThat(fila.getMembershipEnd()).isEqualTo(LocalDateTime.of(2026, 3, 31, 23, 59));
        assertThat(fila.getDaysOwed()).isEqualTo(183); // 31/3 → 30/9
    }

    @Test
    @DisplayName("Se toma el período MÁS LEJANO, no el último pago cargado")
    void tomaElPeriodoMasLejano() {
        crearSucursal();
        UUID socio = crearSocio("Juan", LocalDateTime.of(2026, 3, 31, 23, 59));

        // Cargados en este orden: primero el bueno, después una cuota vieja olvidada.
        crearPago(socio, "paid", LocalDateTime.of(2026, 9, 30, 23, 59));
        crearPago(socio, "paid", LocalDateTime.of(2026, 5, 31, 23, 59));

        List<CoverageGapDTO> gaps = paymentService.findCoverageGaps();

        assertThat(gaps).hasSize(1);
        assertThat(gaps.get(0).getPaidUntil()).isEqualTo(LocalDateTime.of(2026, 9, 30, 23, 59));
    }

    @Test
    @DisplayName("Corregir deja al socio con la fecha real y lo saca de la lista")
    void corregirLoSacaDeLaLista() {
        crearSucursal();
        UUID socio = crearSocio("Juan", LocalDateTime.of(2026, 3, 31, 23, 59));
        crearPago(socio, "paid", LocalDateTime.of(2026, 9, 30, 23, 59));

        assertThat(paymentService.findCoverageGaps()).hasSize(1);

        LocalDateTime aplicado = paymentService.fixCoverage(socio);

        assertThat(aplicado).isEqualTo(LocalDateTime.of(2026, 9, 30, 23, 59));
        assertThat(paymentService.findCoverageGaps()).isEmpty();
    }
}
