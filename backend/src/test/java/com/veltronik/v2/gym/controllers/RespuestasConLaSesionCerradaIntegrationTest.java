package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.AccessRegisterInputDTO;
import com.veltronik.v2.gym.dto.GymPaymentDTO;
import com.veltronik.v2.gym.dto.GymPaymentInputDTO;
import com.veltronik.v2.gym.mappers.GymPaymentMapper;
import com.veltronik.v2.gym.services.GymPaymentService;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * ⭐ LO QUE UN CONTROLADOR DEVUELVE SE ARMA CON LA SESIÓN CERRADA. Acá se prueba así.
 *
 * <p><b>El barrido después de Santo Sport (05/10/2026).</b> Aquel error fue uno solo —un alta
 * reintentada cuyo arancel era un proxy sin sesión— pero la causa es de familia: este proyecto
 * corre con {@code open-in-view=false}, el servicio cierra su transacción y el controlador
 * arma el DTO después. Todo lo que el DTO toque y no haya venido en la consulta explota recién
 * ahí, con un 500 que <b>deja el cambio hecho y la pantalla en rojo</b>.</p>
 *
 * <p><b>⚠️ Los tests {@code @Transactional} no lo pueden ver</b>: su transacción deja la sesión
 * abierta y el proxy se carga solo. Por eso esta clase no lo es, y llama a cada camino igual
 * que lo llama un pedido de verdad. Siembra con ids al azar porque no hay rollback.</p>
 *
 * <p>Los caminos que la COLA del terminal reintenta están en
 * {@link ReintentoConArancelIntegrationTest}; estos son los demás que devuelven un cobro o un
 * acceso.</p>
 */
class RespuestasConLaSesionCerradaIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private GymPaymentController cobros;

    @Autowired
    private GymAccessController accesos;

    @Autowired
    private GymPaymentService paymentService;

    @Autowired
    private GymPaymentMapper paymentMapper;

    private UUID gym;
    private UUID arancel;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, is_active) "
                + "VALUES (?, now(), now(), 'Gimnasio de la sesión cerrada', true)", gym);

        arancel = UUID.randomUUID();
        jdbc.update("INSERT INTO gym_plan (id, tenant_id, name, price, duration_days, is_active, "
                + "created_at, updated_at) VALUES (?, ?, 'Pase libre', 45000, 30, true, now(), now())",
                arancel, gym);

        socio = UUID.randomUUID();
        jdbc.update("INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document, "
                + "plan_id, is_active, created_at, updated_at) "
                + "VALUES (?, ?, 'Socio', 'Con Arancel', ?, ?, ?, true, now(), now())",
                socio, gym, socio + "@test.com", socio.toString().substring(0, 8), arancel);

        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /** Un cobro con arancel ya guardado, como los que hace el mostrador todos los días. */
    private UUID cobroConArancel() {
        GymPaymentInputDTO in = new GymPaymentInputDTO();
        in.setMemberId(socio);
        in.setPlanId(arancel);
        in.setAmount(new BigDecimal("45000"));
        in.setPaymentDate(LocalDateTime.now());
        in.setPaymentMethod("CASH");
        in.setStatus("PAID");
        return cobros.createPayment(in).getBody().getId();
    }

    @Test
    @DisplayName("ver un cobro con arancel devuelve el cobro, con su arancel")
    void verUnCobroConArancel() {
        UUID id = cobroConArancel();

        // Igual que en la anulación: el controlador pide dueño o admin, y lo que se prueba es
        // lo que hace después de dejarlo pasar.
        GymPaymentDTO dto = paymentMapper.toDto(paymentService.findByIdAndVerifyOwnership(id));

        assertEquals("Pase libre", dto.getPlan().getName());
    }

    @Test
    @DisplayName("⚠️ editar un cobro con arancel no deja el cambio hecho y la pantalla en rojo")
    void editarUnCobroConArancel() {
        UUID id = cobroConArancel();
        GymPaymentInputDTO cambio = new GymPaymentInputDTO();
        cambio.setNotes("pagó con billetes de mil");

        GymPaymentDTO dto = cobros.updatePayment(id, cambio, "Caja").getBody();

        assertEquals("pagó con billetes de mil", dto.getNotes());
        assertEquals("Pase libre", dto.getPlan().getName());
    }

    @Test
    @DisplayName("⚠️ anular un cobro con arancel devuelve el cobro anulado, no un 500")
    void anularUnCobroConArancel() {
        UUID id = cobroConArancel();

        // El controlador pide dueño o admin; acá interesa lo que pasa después: armar la
        // respuesta con lo que devuelve el servicio, igual que lo hace él.
        GymPaymentDTO dto = paymentMapper.toDto(paymentService.anular(id, "se cobró dos veces", "Caja").pago());

        assertNotNull(dto.getAnuladoAt());
        assertEquals("Pase libre", dto.getPlan().getName());
    }

    @Test
    @DisplayName("la entrada de un socio con arancel, mandada dos veces, contesta las dos veces")
    void laEntradaSePuedeReintentar() {
        UUID sello = UUID.randomUUID();
        AccessRegisterInputDTO in = new AccessRegisterInputDTO();
        in.setMemberId(socio);
        in.setMethod("manual");
        in.setClientRef(sello);

        accesos.registerAccess(in);
        // Mismo sello: el servidor devuelve el acceso que ya tenía.
        Map<String, Object> segunda = accesos.registerAccess(in).getBody();

        assertNotNull(segunda.get("acceso"));
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM access_log WHERE tenant_id = ?", Integer.class, gym),
                "y sigue habiendo una sola visita");
    }
}
