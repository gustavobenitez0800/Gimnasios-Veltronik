package com.veltronik.v2;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.sql.Connection;
import java.sql.Statement;

/**
 * Test de ARRANQUE REAL del backend — la red de seguridad que faltaba (y cuya ausencia tiró prod
 * en el deploy del 2026-06-18).
 *
 * <p>Levanta el contexto Spring COMPLETO contra una PostgreSQL embebida (in-process, sin Docker),
 * deja que <b>Flyway aplique TODAS las migraciones V1→V28</b> sobre una base limpia, y que
 * <b>Hibernate valide cada @Entity contra el esquema</b> ({@code ddl-auto=validate}). Si una
 * migración rompe, una entidad no matchea su tabla, un {@code @Query} es inválido o un bean no
 * cablea, el contexto NO carga y este test FALLA — atajando el error en el build, no en producción.</p>
 *
 * <p>Se llama {@code *Test} (no {@code *IT}) a propósito: así corre en {@code mvn test} como parte
 * de la suite normal (Surefire), no solo en la fase {@code verify}. Usa PostgreSQL real (no H2)
 * porque las migraciones usan features propias de Postgres (tipo {@code uuid}, índices únicos
 * parciales, {@code TEXT}). El Dockerfile compila con {@code -DskipTests}, así que esto NO frena
 * el deploy.</p>
 */
@SpringBootTest
class ApplicationBootTest {

    private static EmbeddedPostgres postgres;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) throws Exception {
        postgres = EmbeddedPostgres.builder().start();
        // Stub del esquema 'auth' de Supabase: V11/V17 crean un trigger y leen de auth.users —
        // que en Supabase existe pero en una Postgres vanilla no. Lo creamos vacío para que esas
        // migraciones core corran; en el test no se insertan usuarios, así que el trigger no dispara.
        try (Connection c = postgres.getPostgresDatabase().getConnection();
             Statement st = c.createStatement()) {
            st.execute("CREATE SCHEMA IF NOT EXISTS auth");
            st.execute("CREATE TABLE IF NOT EXISTS auth.users ("
                    + "id uuid PRIMARY KEY, email varchar(255), raw_user_meta_data jsonb)");
        }
        // Datasource → la Postgres embebida (pisa el ${DB_URL} de application.properties).
        registry.add("spring.datasource.url", () -> postgres.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "postgres");
        // Placeholders sin default que el contexto debe resolver al arrancar (dummies, sin red real:
        // el JwtDecoder de Supabase resuelve el JWKS lazy y el SDK de MP solo setea el token).
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
    void contextLoadsAndAllMigrationsApply() {
        // Llegar acá significa: Flyway aplicó V1→V28 en una DB limpia, Hibernate validó TODAS las
        // entidades (kiosk + fiscal + courts + gym + core) contra el esquema, y todos los beans
        // cablearon. Es la prueba de que el push a main arranca igual que gym/courts.
    }
}
