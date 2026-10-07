package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.gym.dto.GymMemberInputDTO;
import com.veltronik.v2.gym.dto.GymPaymentDTO;
import com.veltronik.v2.gym.dto.GymPaymentInputDTO;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * ⭐⭐ LO QUE EL TERMINAL MANDA DOS VECES TIENE QUE CONTESTAR LAS DOS VECES.
 *
 * <p><b>Lo que pasó (Santo Sport, 05/10/2026).</b> Se dio de alta un socio con arancel y el
 * escritorio mandó esa alta una segunda vez. El servidor tiene un camino para eso —"ya lo tengo,
 * te lo devuelvo"— que buscaba al socio SIN su arancel y armaba la respuesta fuera de la
 * transacción: {@code LazyInitializationException}, 500. Para la cola del terminal un 500 es
 * "probá de nuevo", así que lo reintentó cada cinco minutos durante 36 horas, y como la cola sube
 * en orden estricto, detrás quedaron 139 entradas, cobros y el cierre de caja. La pantalla decía
 * "se mandan al volver internet" con el internet andando.</p>
 *
 * <p><b>⚠️ POR QUÉ ESTA CLASE NO ES {@code @Transactional}, Y NO ES UN DESCUIDO.</b> El test que
 * ya cubría el alta reintentada ({@code AltaConIdDelTerminalIntegrationTest}) lo es, y por eso
 * no vio nada: con una transacción abierta alrededor, el arancel perezoso se carga solo cuando
 * el mapper lo toca. En producción no hay ninguna abierta ({@code open-in-view=false}): la del
 * servicio ya cerró cuando el controlador arma el DTO. Acá se llama al controlador igual que lo
 * llama un pedido de verdad.</p>
 *
 * <p>Como no hay rollback, cada test siembra con ids al azar y consulta acotado a ellos.</p>
 */
class ReintentoConArancelIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private GymMemberController socios;

    @Autowired
    private GymPaymentController cobros;

    private UUID gym;
    private UUID arancel;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, is_active) "
                + "VALUES (?, now(), now(), 'Gimnasio del reintento', true)", gym);

        arancel = UUID.randomUUID();
        jdbc.update("INSERT INTO gym_plan (id, tenant_id, name, price, duration_days, is_active, "
                + "created_at, updated_at) VALUES (?, ?, 'Pase libre', 45000, 30, true, now(), now())",
                arancel, gym);

        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /** El alta como la arma el mostrador: con el id del terminal y con el arancel elegido. */
    private GymMemberInputDTO alta(UUID id) {
        GymMemberInputDTO in = new GymMemberInputDTO();
        in.setId(id);
        in.setFirstName("Socio");
        in.setLastName("Con Arancel");
        in.setDocument(id.toString().substring(0, 8));
        in.setPlanId(arancel);
        return in;
    }

    private UUID socioYaCargado() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document, "
                + "is_active, created_at, updated_at) VALUES (?, ?, 'Socio', 'Del Cobro', ?, ?, true, now(), now())",
                id, gym, id + "@test.com", id.toString().substring(0, 8));
        return id;
    }

    /** El cobro como lo arma el mostrador: con su arancel y con su sello. */
    private GymPaymentInputDTO cobro(UUID socio, UUID sello) {
        GymPaymentInputDTO in = new GymPaymentInputDTO();
        in.setMemberId(socio);
        in.setPlanId(arancel);
        in.setAmount(new BigDecimal("45000"));
        in.setPaymentDate(LocalDateTime.now());
        in.setPaymentMethod("CASH");
        in.setStatus("PAID");
        in.setClientRef(sello);
        return in;
    }

    @Test
    @DisplayName("⭐⭐ el alta de un socio CON arancel, mandada dos veces, contesta las dos veces")
    void elAltaConArancelSePuedeReintentar() {
        UUID id = UUID.randomUUID();

        socios.createMember(alta(id));
        // La segunda es la que tiraba 500 y taponaba la cola del terminal.
        GymMemberDTO segunda = socios.createMember(alta(id)).getBody();

        assertEquals(id, segunda.getId());
        assertEquals("Pase libre", segunda.getPlanNombre(),
                "el reintento tiene que devolver la ficha entera, con su arancel");
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM gym_member WHERE tenant_id = ?", Integer.class, gym),
                "y sigue habiendo un solo socio");
    }

    @Test
    @DisplayName("⭐⭐ el cobro CON arancel, mandado dos veces, contesta las dos veces y cobra una")
    void elCobroConArancelSePuedeReintentar() {
        UUID socio = socioYaCargado();
        UUID sello = UUID.randomUUID();

        GymPaymentDTO primero = cobros.createPayment(cobro(socio, sello)).getBody();
        // Mismo sello: el servidor devuelve el que ya tenía. Tiene que poder armarlo.
        GymPaymentDTO segundo = cobros.createPayment(cobro(socio, sello)).getBody();

        assertEquals(primero.getId(), segundo.getId(), "es el mismo cobro, no uno nuevo");
        assertEquals("Pase libre", segundo.getPlan().getName(),
                "el reintento tiene que devolver el cobro entero, con su arancel");
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM gym_payment WHERE tenant_id = ?", Integer.class, gym),
                "y se cobró una sola vez");
    }
}
