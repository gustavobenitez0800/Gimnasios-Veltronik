package com.veltronik.v2.gym.services;

import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * La V63 pone la garantía de "un reintento no duplica" para la PLATA, y esto la prueba.
 *
 * <p><b>Por qué se prueba la migración y no el servicio.</b> La garantía vive en la base a
 * propósito: el vaciado de la cola puede correr dos veces a la vez, y un "buscá si ya existe y
 * si no insertá" tiene una ventana entre las dos mitades donde las dos pasan. El índice único
 * no la tiene. Probar el servicio con un mock diría que el servicio hace lo que yo creo; esto
 * dice que <b>la base no deja</b>, que es la única afirmación que sirve.</p>
 *
 * <p><b>Y acá importa más que en los accesos.</b> Un acceso repetido invierte al socio; un
 * cobro repetido le <b>regala un mes</b>: el período arranca donde termina la cobertura
 * vigente, así que la segunda copia arranca donde terminó la primera.</p>
 *
 * <p>Va por JDBC pelado y no por JPA: lo que se está probando es un constraint de Postgres, y
 * meter el EntityManager en el medio agrega semántica de transacción que no tiene nada que ver
 * con lo que se quiere afirmar.</p>
 */
class CobrosOfflineMigracionIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private DataSource dataSource;

    /** Un gimnasio nuevo por prueba: la base es compartida entre clases. */
    private UUID crearGimnasio() throws SQLException {
        UUID id = UUID.randomUUID();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO tenant (id, created_at, updated_at, name, is_active)"
                             + " VALUES (?, now(), now(), 'Gimnasio de la V63', true)")) {
            ps.setObject(1, id);
            ps.executeUpdate();
        }
        return id;
    }

    private void cobro(UUID tenant, UUID clientRef) throws SQLException {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO gym_payments (id, tenant_id, amount, payment_date, status, client_ref)"
                             + " VALUES (?, ?, 45000, ?, 'PAID', ?)")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, tenant);
            ps.setObject(3, LocalDateTime.now());
            ps.setObject(4, clientRef);
            ps.executeUpdate();
        }
    }

    private void movimiento(UUID tenant, UUID clientRef) throws SQLException {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO caja_movimiento"
                             + " (id, tenant_id, tipo, categoria, detalle, monto, metodo, fecha, client_ref)"
                             + " VALUES (?, ?, 'EGRESO', 'PROVEEDOR', 'agua, factura 4412', 15000, 'CASH', ?, ?)")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, tenant);
            ps.setObject(3, LocalDateTime.now());
            ps.setObject(4, clientRef);
            ps.executeUpdate();
        }
    }

    @Test
    @DisplayName("⭐ el mismo cobro dos veces no entra: la segunda inserción falla")
    void elMismoCobroNoEntraDosVeces() throws SQLException {
        UUID gym = crearGimnasio();
        UUID sello = UUID.randomUUID();

        cobro(gym, sello);

        assertThrows(SQLException.class, () -> cobro(gym, sello),
                "sin esto, el reintento le regala un mes al socio y cuenta el ingreso dos veces");
    }

    @Test
    @DisplayName("⭐ el mismo movimiento de caja dos veces tampoco")
    void elMismoMovimientoNoEntraDosVeces() throws SQLException {
        UUID gym = crearGimnasio();
        UUID sello = UUID.randomUUID();

        movimiento(gym, sello);

        assertThrows(SQLException.class, () -> movimiento(gym, sello),
                "un egreso contado dos veces deja el arqueo en falso faltante y acusa a quien atendió");
    }

    @Test
    @DisplayName("pero el mismo sello en OTRO gimnasio sí: el aislamiento es por tenant")
    void elSelloDeOtroGimnasioNoMolesta() throws SQLException {
        UUID unGym = crearGimnasio();
        UUID otroGym = crearGimnasio();
        UUID sello = UUID.randomUUID();

        cobro(unGym, sello);

        // Dos gimnasios pueden generar el mismo UUID. Es improbable, pero "improbable" no es
        // una garantía de aislamiento.
        assertDoesNotThrow(() -> cobro(otroGym, sello));
    }

    @Test
    @DisplayName("⚠️ y sin sello se puede cobrar todo lo que haga falta: el índice es PARCIAL")
    void sinSelloNoHayLimite() throws SQLException {
        // Lo que se cobra CON conexión no trae identificador de cliente y no tiene por qué
        // empezar a traerlo. Si el índice no fuera parcial, el segundo cobro del día de
        // cualquier gimnasio fallaría — y serían todas las filas históricas.
        UUID gym = crearGimnasio();

        cobro(gym, null);

        assertDoesNotThrow(() -> cobro(gym, null));
        assertDoesNotThrow(() -> movimiento(gym, null));
        assertDoesNotThrow(() -> movimiento(gym, null));
    }
}
