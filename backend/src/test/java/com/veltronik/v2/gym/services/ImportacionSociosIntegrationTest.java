package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.ImportacionSocios.Accion;
import com.veltronik.v2.gym.dto.ImportacionSocios.Analisis;
import com.veltronik.v2.gym.dto.ImportacionSocios.Fila;
import com.veltronik.v2.gym.dto.ImportacionSocios.FilaAnalizada;
import com.veltronik.v2.gym.dto.ImportacionSocios.Pedido;
import com.veltronik.v2.gym.dto.ImportacionSocios.Resultado;
import com.veltronik.v2.gym.dto.ImportacionSocios.Ultima;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El importador de socios contra Postgres real.
 *
 * <p>Cada test reproduce algo que pasó, o que va a pasar, migrando un gimnasio de verdad. Los
 * que llevan ⭐ son las garantías que el 31/08 no existían: todo o nada, el mismo archivo dos
 * veces no duplica, el archivo no le gana a los cobros, y se puede deshacer.</p>
 */
@DisplayName("Importar socios")
class ImportacionSociosIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private ImportacionSociosService importador;
    @Autowired private JdbcTemplate jdbc;

    private UUID gym;

    @BeforeEach
    void unGimnasioNuevo() {
        gym = crearGimnasio();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    @Nested
    @DisplayName("un archivo sano")
    class ArchivoSano {

        @Test
        @DisplayName("crea a todos, con cada dato donde va")
        void creaATodos() {
            UUID paseLibre = crearArancel(gym, "Pase Libre");

            Resultado r = importador.importar(pedido(
                    fila(2, "Ana", "Gómez", "30.111.222", "30/09/2026", "pase libre", "Activo"),
                    fila(3, "BETO RÍOS", null, "31222333", "15/10/2026", null, null),
                    fila(4, "Carla", "Paz", "32333444", "01/08/2026", null, "Baja")));

            assertThat(r.creados()).isEqualTo(3);
            assertThat(r.importacionId()).isNotNull();

            Map<String, Object> ana = socio("30111222");
            assertThat(ana.get("first_name")).isEqualTo("Ana");
            assertThat(ana.get("last_name")).isEqualTo("Gómez");
            // El vencimiento del archivo es una fecha: vence al cerrar ese día.
            assertThat(ana.get("membership_end")).isEqualTo(java.sql.Timestamp.valueOf(
                    LocalDateTime.of(2026, 9, 30, 23, 59, 59)));
            // "pase libre" encuentra a "Pase Libre": el arancel no depende de mayúsculas.
            assertThat(ana.get("plan_id")).isEqualTo(paseLibre);
            assertThat(ana.get("is_active")).isEqualTo(true);

            // Nombre y apellido en una sola columna: va entero, no se inventa un orden.
            Map<String, Object> beto = socio("31222333");
            assertThat(beto.get("first_name")).isEqualTo("BETO RÍOS");
            assertThat(beto.get("last_name")).isEqualTo("");

            assertThat(socio("32333444").get("is_active")).isEqualTo(false);
        }

        @Test
        @DisplayName("⭐ el mismo archivo dos veces no duplica a nadie")
        void idempotente() {
            Pedido p = pedido(
                    fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null),
                    fila(3, "Beto", "Ríos", "31222333", "15/10/2026", null, null));
            importador.importar(p);

            Resultado otraVez = importador.importar(p);

            assertThat(otraVez.importacionId()).as("no había nada que hacer").isNull();
            assertThat(otraVez.sinCambios()).isEqualTo(2);
            assertThat(cuantosSocios()).isEqualTo(2);
        }

        @Test
        @DisplayName("las filas vacías del final del Excel no cuentan")
        void filasVacias() {
            Analisis a = importador.analizar(pedido(
                    fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null),
                    new Fila(3, " ", null, "", null, null, null, null, null, null, null, null, null, null, null, null)));
            assertThat(a.total()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("un archivo con problemas")
    class ArchivoConProblemas {

        @Test
        @DisplayName("⭐ una sola fila mala frena todo, y no se escribe nada")
        void todoONada() {
            Pedido p = pedido(
                    fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null),
                    fila(3, "Beto", "Ríos", "31222333", "31/02/2026", null, null),
                    fila(4, "Carla", "Paz", "32333444", "01/10/2026", null, null));

            assertThatThrownBy(() -> importador.importar(p))
                    .isInstanceOf(ImportacionSociosService.ImportacionConErrores.class)
                    .satisfies(e -> {
                        Analisis a = ((ImportacionSociosService.ImportacionConErrores) e).getAnalisis();
                        assertThat(a.conError()).isEqualTo(1);
                        FilaAnalizada mala = conAccion(a, Accion.ERROR).get(0);
                        // El error dice la fila del Excel, para ir derecho a corregirla.
                        assertThat(mala.fila()).isEqualTo(3);
                        assertThat(mala.errores()).anyMatch(m -> m.contains("31/02/2026") && m.contains("no existe"));
                    });
            assertThat(cuantosSocios()).as("ni Ana ni Carla: todo o nada").isZero();
        }

        @Test
        @DisplayName("el mismo documento dos veces en el archivo: error en las dos filas")
        void repetidoEnElArchivo() {
            Analisis a = importador.analizar(pedido(
                    fila(2, "Ana", "Gómez", "30.111.222", "30/09/2026", null, null),
                    fila(9, "Ana", "Gomez", "30111222", "30/10/2026", null, null)));

            assertThat(a.conError()).isEqualTo(2);
            assertThat(a.filas()).allMatch(f -> f.errores().stream().anyMatch(m -> m.contains("filas 2, 9")));
        }

        @Test
        @DisplayName("si Veltronik ya tiene dos socios con ese documento, no adivina cuál")
        void duplicadoEnLaBase() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 1, 23, 59));
            crearSocio(gym, "Ana bis", "30.111.222", LocalDateTime.of(2026, 9, 1, 23, 59));

            Analisis a = importador.analizar(pedido(fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null)));

            assertThat(a.conError()).isEqualTo(1);
            assertThat(a.filas().get(0).errores().get(0)).contains("ya hay 2 socios");
        }

        @Test
        @DisplayName("sin documento no se importa: no habría forma de reconocerlo después")
        void sinDocumento() {
            Analisis a = importador.analizar(pedido(fila(2, "Ana", "Gómez", "", "30/09/2026", null, null)));
            assertThat(a.filas().get(0).accion()).isEqualTo(Accion.ERROR);
            assertThat(a.filas().get(0).errores().get(0)).contains("Falta el documento");
        }

        @Test
        @DisplayName("un arancel que no existe no frena: avisa una vez, agrupado")
        void arancelInexistente() {
            Analisis a = importador.analizar(pedido(
                    fila(2, "Ana", "Gómez", "30111222", "30/09/2026", "Funcional", null),
                    fila(3, "Beto", "Ríos", "31222333", "30/09/2026", "Funcional", null)));

            assertThat(a.conError()).isZero();
            assertThat(a.crear()).isEqualTo(2);
            assertThat(a.avisosGenerales()).anyMatch(m -> m.contains("«Funcional»") && m.contains("2 socios"));
        }

        @Test
        @DisplayName("más de 5000 filas: se pide dividir el archivo")
        void demasiadasFilas() {
            List<Fila> muchas = new ArrayList<>();
            for (int i = 0; i < ImportacionSociosService.MAXIMO_FILAS + 1; i++) {
                muchas.add(fila(i + 2, "Socio", String.valueOf(i), String.valueOf(10_000_000 + i), "30/09/2026", null, null));
            }
            assertThatThrownBy(() -> importador.analizar(new Pedido("grande.xlsx", muchas)))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Dividilo");
        }
    }

    @Nested
    @DisplayName("socios que ya existen")
    class SociosQueYaExisten {

        @Test
        @DisplayName("⭐ se actualiza solo lo que el archivo trae: una celda vacía no borra nada")
        void soloLoQueTrae() {
            UUID id = crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 1, 23, 59));
            jdbc.update("UPDATE gym_member SET phone = '3756111111' WHERE id = ?", id);

            // El archivo trae el documento con puntos, no trae teléfono, y trae otro vencimiento.
            Analisis a = importador.analizar(pedido(fila(2, "Ana", null, "30.111.222", "30/09/2026", null, null)));
            FilaAnalizada f = a.filas().get(0);
            assertThat(f.accion()).isEqualTo(Accion.ACTUALIZAR);
            assertThat(f.cambios()).containsExactly("Vencimiento: 01/09/2026 → 30/09/2026");

            importador.importar(pedido(fila(2, "Ana", null, "30.111.222", "30/09/2026", null, null)));

            Map<String, Object> ana = socio("30111222");
            assertThat(ana.get("phone")).as("el teléfono no se tocó").isEqualTo("3756111111");
            assertThat(cuantosSocios()).isEqualTo(1);
        }

        @Test
        @DisplayName("⭐ a quien ya cobra por Veltronik, el archivo no le mueve el vencimiento")
        void losCobrosMandan() {
            LocalDateTime pagoHasta = LocalDateTime.of(2026, 10, 19, 10, 30);
            UUID id = crearSocio(gym, "Ana", "30111222", pagoHasta);
            crearPago(gym, id, pagoHasta);

            // Un export viejo del otro sistema, de antes de que pagara en el mostrador.
            Analisis a = importador.analizar(pedido(fila(2, "Ana", null, "30111222", "30/08/2026", null, null)));

            FilaAnalizada f = a.filas().get(0);
            assertThat(f.accion()).isEqualTo(Accion.SIN_CAMBIOS);
            assertThat(f.avisos()).anyMatch(m -> m.contains("Ya cobra por Veltronik"));
        }

        @Test
        @DisplayName("un nombre que solo cambia en mayúsculas no es un cambio")
        void mayusculas() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 30, 23, 59, 59));
            jdbc.update("UPDATE gym_member SET last_name = 'Gómez' WHERE tenant_id = ?", gym);

            Analisis a = importador.analizar(pedido(fila(2, "ANA GÓMEZ", null, "30111222", "30/09/2026", null, null)));
            assertThat(a.filas().get(0).accion()).isEqualTo(Accion.SIN_CAMBIOS);
        }

        @Test
        @DisplayName("el socio de OTRO gimnasio con el mismo DNI no existe para este")
        void aislamiento() {
            UUID otro = crearGimnasio();
            crearSocio(otro, "Ana", "30111222", LocalDateTime.of(2026, 9, 1, 23, 59));

            Analisis a = importador.analizar(pedido(fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null)));
            assertThat(a.filas().get(0).accion()).isEqualTo(Accion.CREAR);
        }
    }

    @Nested
    @DisplayName("deshacer")
    class Deshacer {

        @Test
        @DisplayName("⭐ borra los que creó y les devuelve a los actualizados lo que tenían")
        void deshaceTodo() {
            UUID previo = crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 1, 23, 59));
            Resultado r = importador.importar(pedido(
                    fila(2, "Ana", null, "30111222", "30/09/2026", null, "Baja"),
                    fila(3, "Beto", "Ríos", "31222333", "15/10/2026", null, null)));
            assertThat(r.creados()).isEqualTo(1);
            assertThat(r.actualizados()).isEqualTo(1);

            Ultima u = importador.deshacer(r.importacionId());

            assertThat(u.deshecha()).isTrue();
            assertThat(u.sePuedeDeshacer()).isFalse();
            assertThat(cuantosSocios()).as("Beto se fue, Ana quedó").isEqualTo(1);
            Map<String, Object> ana = jdbc.queryForMap("SELECT * FROM gym_member WHERE id = ?", previo);
            assertThat(ana.get("membership_end")).isEqualTo(java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 9, 1, 23, 59)));
            assertThat(ana.get("is_active")).isEqualTo(true);
        }

        @Test
        @DisplayName("no deshace si alguien tocó un socio después: pisaría ese cambio")
        void noSiSeToco() {
            Resultado r = importador.importar(pedido(fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null)));
            // Alguien le corrigió el teléfono en el mostrador un rato después.
            jdbc.update("UPDATE gym_member SET phone = '999', updated_at = updated_at + interval '1 minute' "
                    + "WHERE tenant_id = ?", gym);

            Ultima u = importador.ultima().orElseThrow();
            assertThat(u.sePuedeDeshacer()).isFalse();
            assertThat(u.porQueNo()).contains("cambió después de importar").contains("Ana Gómez");
            assertThatThrownBy(() -> importador.deshacer(r.importacionId()))
                    .isInstanceOf(ResponseStatusException.class);
            assertThat(cuantosSocios()).isEqualTo(1);
        }

        @Test
        @DisplayName("no deshace a un socio importado que ya pasó por la puerta")
        void noSiEntro() {
            Resultado r = importador.importar(pedido(fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null)));
            UUID ana = (UUID) socio("30111222").get("id");
            jdbc.update("INSERT INTO access_log (id, created_at, updated_at, tenant_id, member_id, check_in_at, "
                    + "auto_closed) VALUES (?, now(), now(), ?, ?, now(), false)", UUID.randomUUID(), gym, ana);

            assertThat(importador.ultima().orElseThrow().porQueNo()).contains("pasó por la puerta");
        }

        @Test
        @DisplayName("solo la última: la anterior espera a que se deshaga la nueva")
        void soloLaUltima() {
            Resultado primera = importador.importar(pedido(fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null)));
            importador.importar(pedido(fila(2, "Beto", "Ríos", "31222333", "30/09/2026", null, null)));

            assertThatThrownBy(() -> importador.deshacer(primera.importacionId()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Solo se puede deshacer la última");
        }

        @Test
        @DisplayName("la importación de otro gimnasio no se puede deshacer desde este")
        void deOtroGimnasio() {
            Resultado r = importador.importar(pedido(fila(2, "Ana", "Gómez", "30111222", "30/09/2026", null, null)));
            TenantContextHolder.setTenantId(crearGimnasio());

            assertThatThrownBy(() -> importador.deshacer(r.importacionId()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("No existe");
        }
    }

    // ── Siembra y ayudas ───────────────────────────────────────────────────────

    private UUID crearGimnasio() {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                id, now, now, "Gimnasio " + id, "GYM");
        return id;
    }

    private UUID crearArancel(UUID tenant, String nombre) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO gym_plan (id, tenant_id, name, price, duration_days, is_active, created_at, updated_at) "
                + "VALUES (?, ?, ?, ?, 30, true, now(), now())", id, tenant, nombre, new BigDecimal("45000"));
        return id;
    }

    private UUID crearSocio(UUID tenant, String nombre, String documento, LocalDateTime vence) {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO gym_member (id, created_at, updated_at, tenant_id, first_name, last_name, "
                        + "email, document, is_active, membership_end) VALUES (?,?,?,?,?,?,?,?,?,?)",
                id, now, now, tenant, nombre, "", "", documento, true, vence);
        return id;
    }

    private void crearPago(UUID tenant, UUID socio, LocalDateTime cubreHasta) {
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO gym_payment (id, created_at, updated_at, tenant_id, member_id, amount, "
                        + "payment_date, status, period_end) VALUES (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), now, now, tenant, socio, new BigDecimal("55000"), now, "paid", cubreHasta);
    }

    private static Fila fila(int n, String nombre, String apellido, String documento, String vencimiento,
                             String arancel, String estado) {
        return new Fila(n, nombre, apellido, documento, null, null, null, null, vencimiento, arancel, estado,
                null, null, null, null, null);
    }

    private static Pedido pedido(Fila... filas) {
        return new Pedido("socios.xlsx", List.of(filas));
    }

    private Map<String, Object> socio(String documento) {
        return jdbc.queryForMap("SELECT * FROM gym_member WHERE tenant_id = ? AND document = ? AND deleted_at IS NULL",
                gym, documento);
    }

    private int cuantosSocios() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM gym_member WHERE tenant_id = ? AND deleted_at IS NULL",
                Integer.class, gym);
        return n == null ? 0 : n;
    }

    private static List<FilaAnalizada> conAccion(Analisis a, Accion accion) {
        return a.filas().stream().filter(f -> f.accion() == accion).toList();
    }
}
