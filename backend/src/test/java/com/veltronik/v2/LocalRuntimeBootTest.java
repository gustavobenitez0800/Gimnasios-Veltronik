package com.veltronik.v2;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.CleanupMode;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;

/**
 * Arranque real del CEREBRO LOCAL (ADR-009, ladrillo 3): el hermano de
 * {@link ApplicationBootTest}, pero por el camino de producción del instalable.
 *
 * <p>Activa el perfil {@code local} de verdad: {@code LocalEmbeddedPostgresConfig} arranca su
 * propia Postgres embebida (data dir temporal, puerto libre), stubea el esquema {@code auth},
 * Flyway aplica TODAS las migraciones sobre esa base virgen y Hibernate valida cada entidad.
 * Si esto pasa, el runtime local del instalable arranca — con la misma corrida, el boot test
 * clásico protege a Railway y este protege a la flota.</p>
 */
@SpringBootTest
@ActiveProfiles("local")
class LocalRuntimeBootTest {

    // CleanupMode.NEVER: el contexto Spring (y con él la Postgres embebida que traba el
    // pgdata) se cierra DESPUÉS de que JUnit intenta borrar el @TempDir — dejarlo vivo
    // evita el falso error de teardown; el %TEMP% del SO lo recolecta solo.
    @TempDir(cleanup = CleanupMode.NEVER)
    static Path tempDir;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        // Data dir efímero del test (en el kiosco real es %LOCALAPPDATA%\Veltronik\pgdata)
        registry.add("veltronik.local.data-dir", () -> tempDir.resolve("pgdata").toString());
        // <=0 → zonky elige un puerto libre (el fijo 47811 podría estar ocupado en CI)
        registry.add("veltronik.local.pg-port", () -> "0");
    }

    @Test
    void elCerebroLocalArrancaCompleto() {
        // Llegar acá significa: Postgres embebida arrancó con data dir persistente, el stub
        // de auth existe, V1→Vn aplicadas en una base limpia, entidades validadas, beans OK.
    }
}
