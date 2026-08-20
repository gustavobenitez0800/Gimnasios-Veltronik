package com.veltronik.v2.support;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Base para los tests que necesitan PostgreSQL de verdad.
 *
 * <p><b>Una sola instancia para todas las clases que hereden.</b> El patrón anterior —cada
 * clase levanta su propio Postgres en un {@code @DynamicPropertySource} estático— hace que
 * el costo crezca con cada test nuevo: son ~30 segundos y varios cientos de MB por clase.
 * Ya se vio un arranque fallar por contención cuando corrían dos a la vez.</p>
 *
 * <p>Acá el servidor se levanta una vez por JVM y se apaga cuando la JVM termina. Como
 * además las propiedades que se registran son idénticas para todas las subclases, Spring
 * reutiliza el mismo contexto de aplicación en vez de reconstruirlo por clase.</p>
 *
 * <p>La contrapartida es que las subclases comparten base: cada test tiene que sembrar sus
 * propios datos con ids aleatorios y consultar acotado a ellos, sin asumir que la base
 * empieza vacía.</p>
 */
@SpringBootTest
public abstract class EmbeddedPostgresTest {

    private static EmbeddedPostgres postgres;

    private static synchronized EmbeddedPostgres instance() throws Exception {
        if (postgres == null) {
            postgres = EmbeddedPostgres.builder().start();
            // Stub del esquema 'auth' de Supabase (V11/V17 lo referencian; acá no se usa).
            try (Connection c = postgres.getPostgresDatabase().getConnection();
                 Statement st = c.createStatement()) {
                st.execute("CREATE SCHEMA IF NOT EXISTS auth");
                st.execute("CREATE TABLE IF NOT EXISTS auth.users ("
                        + "id uuid PRIMARY KEY, email varchar(255), raw_user_meta_data jsonb)");
            }
            // Apagado al terminar la JVM: con una instancia compartida no hay un @AfterAll
            // que sepa cuál es la última clase en correr.
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    postgres.close();
                } catch (Exception ignored) {
                    // La JVM se está yendo igual.
                }
            }));
        }
        return postgres;
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) throws Exception {
        EmbeddedPostgres pg = instance();
        registry.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "postgres");
        registry.add("SUPABASE_URL", () -> "https://dummy.supabase.co");
        registry.add("MP_ACCESS_TOKEN", () -> "TEST-dummy");
        registry.add("MP_PUBLIC_KEY", () -> "TEST-dummy");
        registry.add("MP_WEBHOOK_SECRET", () -> "dummy");
    }
}
