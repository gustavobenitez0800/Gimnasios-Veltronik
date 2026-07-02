package com.veltronik.v2.core.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * El cerebro local (ADR-009, ladrillo 3): bajo el perfil {@code local}, el monolito arranca
 * su PROPIA PostgreSQL embebida con data dir persistente y se conecta a ella. Es la receta
 * de {@code ApplicationBootTest} convertida en producto — mismo motor que la nube, misma
 * cadena de migraciones Flyway, cero drift de dialecto.
 *
 * <p><b>Nunca corre en la nube:</b> Railway no activa el perfil {@code local}, así que esta
 * clase es inerte en producción cloud (los binarios de Postgres viajan en el jar sin usarse).</p>
 */
@Slf4j
@Configuration
@Profile("local")
public class LocalEmbeddedPostgresConfig {

    /**
     * Arranca Postgres con datos persistentes. {@code destroyMethod=close} detiene el
     * postmaster al apagarse la JVM — por eso el shutdown del instalable debe ser prolijo
     * (POST /actuator/shutdown desde Electron), no un kill duro.
     */
    @Bean(destroyMethod = "close")
    public EmbeddedPostgres embeddedPostgres(
            @Value("${veltronik.local.data-dir:}") String configuredDataDir,
            @Value("${veltronik.local.pg-port:47811}") int pgPort) throws IOException, SQLException {

        Path dataDir = resolveDataDir(configuredDataDir);
        Files.createDirectories(dataDir);

        EmbeddedPostgres.Builder builder = EmbeddedPostgres.builder()
                .setDataDirectory(dataDir.toFile())
                // false: los datos del kiosco NO se borran entre arranques (zonky nació para
                // tests, donde limpia todo; acá es una base de producción local).
                .setCleanDataDirectory(false);
        if (pgPort > 0) {
            builder.setPort(pgPort);
        }
        EmbeddedPostgres postgres = builder.start();

        stubSupabaseAuthSchema(postgres);
        log.info("PostgreSQL embebida lista (puerto {}, datos en {})", postgres.getPort(), dataDir);
        return postgres;
    }

    /** El datasource real del modo local (pisa al autoconfigurado por properties). */
    @Bean
    @Primary
    public DataSource localDataSource(EmbeddedPostgres postgres) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(postgres.getJdbcUrl("postgres", "postgres"));
        config.setUsername("postgres");
        config.setPassword("postgres");
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(1);
        config.setPoolName("veltronik-local");
        return new HikariDataSource(config);
    }

    /**
     * Stub del esquema {@code auth} de Supabase — la MISMA receta de ApplicationBootTest:
     * V11/V17 crean un trigger sobre {@code auth.users}, que en Supabase existe y en una
     * Postgres vanilla no. Idempotente; en modo local nadie inserta en auth.users, así que
     * el trigger jamás dispara.
     */
    private void stubSupabaseAuthSchema(EmbeddedPostgres postgres) throws SQLException {
        try (Connection connection = postgres.getPostgresDatabase().getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA IF NOT EXISTS auth");
            statement.execute("CREATE TABLE IF NOT EXISTS auth.users ("
                    + "id uuid PRIMARY KEY, email varchar(255), raw_user_meta_data jsonb)");
        }
    }

    /**
     * Data dir del ADR-009: configurable; default {@code %LOCALAPPDATA%\Veltronik\pgdata}
     * (fuera del directorio de instalación → sobrevive updates; local, no roaming, y jamás
     * en carpetas sincronizadas tipo OneDrive, que corrompen bases por file-locking).
     */
    private Path resolveDataDir(String configured) {
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured.trim());
        }
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null && !localAppData.isBlank()) {
            return Path.of(localAppData, "Veltronik", "pgdata");
        }
        return Path.of(System.getProperty("user.home"), ".veltronik", "pgdata");
    }
}
