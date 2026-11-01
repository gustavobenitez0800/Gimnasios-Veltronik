package com.veltronik.v2;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Ninguna migración le da permisos a los roles públicos de Supabase ({@code anon},
 * {@code authenticated}, {@code PUBLIC}).
 *
 * <p>Con esos roles entra cualquiera que tenga la clave pública, y la clave pública viaja adentro
 * de cada escritorio instalado. La V68 los dejó sin nada (todos los datos pasan por el backend),
 * y Supabase manda cada tanto un mail con {@code GRANT}s "para que siga andando el Data API" que
 * NO hay que pegar ({@code supabase_rls_cerrado_2026_09_06}). Esta regla hace que el build se
 * ponga en rojo si alguno llega a una migración, en vez de enterarnos en producción.</p>
 */
class MigracionesSinPermisosPublicosTest {

    private static final Path MIGRACIONES = Path.of("src/main/resources/db/migration");

    private static final Pattern COMENTARIOS = Pattern.compile("--[^\\n]*|/\\*.*?\\*/", Pattern.DOTALL);

    /** Un GRANT (suelto o dentro de ALTER DEFAULT PRIVILEGES) a uno de los roles públicos. */
    private static final Pattern PERMISO_PUBLICO = Pattern.compile(
            "\\bGRANT\\b.*\\bTO\\b[^;]*\\b(anon|authenticated|PUBLIC)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    @Test
    void ninguna_migracion_le_da_permisos_a_los_roles_publicos() throws IOException {
        List<String> encontrados = new ArrayList<>();
        try (Stream<Path> archivos = Files.list(MIGRACIONES)) {
            List<Path> sql = archivos.filter(p -> p.toString().endsWith(".sql")).sorted().toList();
            assertFalse(sql.isEmpty(), "no encontré las migraciones en " + MIGRACIONES.toAbsolutePath());
            for (Path archivo : sql) {
                for (String sentencia : sentencias(Files.readString(archivo, StandardCharsets.UTF_8))) {
                    if (PERMISO_PUBLICO.matcher(sentencia).find()) {
                        encontrados.add(archivo.getFileName() + ": " + sentencia.strip().replaceAll("\\s+", " "));
                    }
                }
            }
        }
        assertEquals(List.of(), encontrados,
                "Una migración le da permisos a anon/authenticated/PUBLIC: con la clave pública entraría cualquiera");
    }

    @Test
    void la_regla_reconoce_lo_que_tiene_que_frenar_y_no_se_asusta_de_un_comentario() {
        assertTrue(hayPermisoPublico("GRANT SELECT ON public.gym_member TO anon;"));
        assertTrue(hayPermisoPublico("grant usage on schema public to authenticated;"));
        assertTrue(hayPermisoPublico("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;"));
        assertTrue(hayPermisoPublico("GRANT EXECUTE ON FUNCTION f() TO PUBLIC;"));

        assertFalse(hayPermisoPublico("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;"));
        assertFalse(hayPermisoPublico("GRANT SELECT ON public.gym_member TO veltronik_backup;"));
        assertFalse(hayPermisoPublico("-- No pegar: GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;\nSELECT 1;"));
        // "public" como esquema no es el rol PUBLIC.
        assertFalse(hayPermisoPublico("GRANT USAGE ON SCHEMA public TO veltronik_backup;"));
    }

    private static boolean hayPermisoPublico(String sql) {
        return sentencias(sql).stream().anyMatch(s -> PERMISO_PUBLICO.matcher(s).find());
    }

    /** El SQL sin comentarios, partido por punto y coma (alcanza: ninguna migración usa $$ con GRANT adentro). */
    private static List<String> sentencias(String sql) {
        return List.of(COMENTARIOS.matcher(sql).replaceAll(" ").split(";"));
    }
}
