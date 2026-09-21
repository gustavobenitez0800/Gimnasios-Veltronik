package com.veltronik.v2.gym.controllers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.GymPlanDTO;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 🔴 EL BUG QUE ESTOS TESTS DEFIENDEN: NO SE PODÍA CREAR NINGÚN ARANCEL.
 *
 * <p>Del 2026-09-07 al 2026-09-21, todo arancel nuevo volvía con <i>"El arancel tiene que
 * otorgar días, clases, o las dos cosas"</i>, con cualquier cobertura. Lo encontró el primer
 * gimnasio que se dio de alta después de esa fecha, con 400 socios importados y ningún arancel
 * que asignarles.</p>
 *
 * <p><b>La mecánica.</b> Desde el ADR-013 la pantalla manda la cobertura como
 * {@code coberturaCantidad} + {@code coberturaUnidad} y ya no manda {@code durationDays}. El
 * controlador solo copia {@code durationDays} si viene, así que quedaba en el default de la
 * entidad (0), y {@code validar} seguía mirando eso: rechazaba todo.</p>
 *
 * <p><b>Por qué pasó sin que nada se pusiera rojo:</b> los tests de cobertura siembran el
 * arancel con SQL a mano, con {@code duration_days} escrito. Ninguno creaba un arancel por el
 * camino de la pantalla. Estos sí: arman el cuerpo EXACTO que manda {@code guardar} en
 * {@code ArancelesSettings.jsx}, lo pasan por el mismo {@code ObjectMapper} que usa la API y
 * llaman al CONTROLADOR — con el guardia de rol activo — sin transacción alrededor.</p>
 *
 * <p>⚠️ Si la pantalla cambia qué manda, {@link #cuerpoDeLaPantalla} tiene que cambiar con
 * ella. Es lo único que este test tiene que copiar de afuera.</p>
 */
class ArancelesDesdeLaPantallaIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private GymPlanController controller;

    @Autowired
    private ObjectMapper json;

    private UUID gym;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (?, now(), now(), 'Gimnasio recién dado de alta', true)
                """, gym);
        TenantContextHolder.setTenantId(gym);
        // Crear y editar aranceles es de dueño o admin (@PreAuthorize): se entra como dueño,
        // igual que quien lo encontró.
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "dueño", null, List.of(new SimpleGrantedAuthority("ROLE_OWNER"))));
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    /**
     * El cuerpo que arma {@code guardar} en {@code ArancelesSettings.jsx}, con la cobertura
     * como la codifica el desplegable ({@code "1|MES"}, {@code "7|DIA"}…). <b>Sin
     * {@code durationDays}</b>: es justo lo que la pantalla dejó de mandar.
     */
    private GymPlanDTO cuerpoDeLaPantalla(String nombre, int precio, String cobertura) throws Exception {
        String[] partes = cobertura.split("\\|");
        return json.readValue("""
                {"name": "%s", "price": %d, "coberturaCantidad": %s, "coberturaUnidad": "%s"}
                """.formatted(nombre, precio, partes[0], partes[1]), GymPlanDTO.class);
    }

    private Map<String, Object> enLaBase(UUID arancel) {
        return jdbc.queryForMap("""
                SELECT name, price, cobertura_cantidad, cobertura_unidad, is_active
                FROM gym_plan WHERE id = ? AND tenant_id = ?
                """, arancel, gym);
    }

    private GymPlanDTO crear(String nombre, int precio, String cobertura) throws Exception {
        GymPlanDTO creado = controller.crear(cuerpoDeLaPantalla(nombre, precio, cobertura)).getBody();
        assertNotNull(creado);
        assertNotNull(creado.getId());
        return creado;
    }

    @Test
    @DisplayName("🔴 el caso que se vio en producción: 'Musculación - Semana completa', $34.000, 1 mes")
    void elCasoDeProduccion() throws Exception {
        GymPlanDTO creado = crear("Musculación - Semana completa", 34000, "1|MES");

        Map<String, Object> fila = enLaBase(creado.getId());
        assertEquals("Musculación - Semana completa", fila.get("name"));
        assertEquals(0, new BigDecimal("34000").compareTo((BigDecimal) fila.get("price")));
        assertEquals(1, fila.get("cobertura_cantidad"));
        assertEquals("MES", fila.get("cobertura_unidad"));
        assertEquals(true, fila.get("is_active"));
    }

    /** Todas las opciones del desplegable, una por una. Si se agrega una, va acá también. */
    @ParameterizedTest(name = "se crea un arancel de «{0}»")
    @ValueSource(strings = {"1|DIA", "7|DIA", "15|DIA", "1|MES", "2|MES", "3|MES", "6|MES", "12|MES", "0|DIA"})
    void todasLasCoberturasDelDesplegable(String cobertura) throws Exception {
        GymPlanDTO creado = crear("Arancel " + cobertura, 45000, cobertura);

        String[] partes = cobertura.split("\\|");
        Map<String, Object> fila = enLaBase(creado.getId());
        assertEquals(Integer.parseInt(partes[0]), fila.get("cobertura_cantidad"));
        assertEquals(partes[1], fila.get("cobertura_unidad"));
        // Lo que devuelve la API es lo que la tabla de la pantalla muestra en "Otorga".
        assertEquals(Integer.parseInt(partes[0]), creado.getCoberturaCantidad());
        assertEquals(partes[1], creado.getCoberturaUnidad());
    }

    @Test
    @DisplayName("editar desde la pantalla cambia la cobertura (pasa por la misma validación)")
    void editarCambiaLaCobertura() throws Exception {
        GymPlanDTO creado = crear("Pase", 45000, "1|MES");

        controller.editar(creado.getId(), cuerpoDeLaPantalla("Pase Semanal", 15000, "7|DIA"));
        Map<String, Object> fila = enLaBase(creado.getId());
        assertEquals("Pase Semanal", fila.get("name"));
        assertEquals(7, fila.get("cobertura_cantidad"));
        assertEquals("DIA", fila.get("cobertura_unidad"));

        controller.editar(creado.getId(), cuerpoDeLaPantalla("Clase suelta", 5000, "0|DIA"));
        assertEquals(0, enLaBase(creado.getId()).get("cobertura_cantidad"));
    }

    @Test
    @DisplayName("una clase suelta anterior a la V65 (duration_days = 0) se puede editar")
    void editarUnaClaseSueltaVieja() throws Exception {
        // La V65 migró duration_days = 0 a "no cubre tiempo". Con la validación vieja, cambiarle
        // el precio a uno de esos también rebotaba.
        UUID viejo = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO gym_plan (id, tenant_id, name, price, duration_days,
                                       cobertura_cantidad, cobertura_unidad, is_active,
                                       created_at, updated_at)
                VALUES (?, ?, 'Clase suelta', 4000, 0, 0, 'DIA', true, now(), now())
                """, viejo, gym);

        controller.editar(viejo, cuerpoDeLaPantalla("Clase suelta", 5000, "0|DIA"));

        assertEquals(0, new BigDecimal("5000").compareTo((BigDecimal) enLaBase(viejo).get("price")));
    }

    @Test
    @DisplayName("una unidad que no es días ni meses es un 400 con palabras, no un 500 de la base")
    void unidadInvalida() throws Exception {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> controller.crear(cuerpoDeLaPantalla("Pase", 45000, "1|SEMANA")));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
    }

    @Test
    @DisplayName("una cobertura negativa es un 400")
    void coberturaNegativa() throws Exception {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> controller.crear(cuerpoDeLaPantalla("Pase", 45000, "-1|MES")));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
    }
}
