package com.veltronik.v2.core.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.veltronik.v2.core.entities.Cashier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** Tokens de sesión local (ladrillo 6): firma infalsificable, ida y vuelta, vencimiento. */
class LocalSessionServiceTest {

    private LocalSessionService service;

    @BeforeEach
    void setUp() {
        // Sin stubbing: el mock devuelve null en queryForList → el service genera un
        // secreto fresco en memoria (guarda contra null en loadOrCreateSecret).
        this.service = new LocalSessionService(mock(JdbcTemplate.class), new ObjectMapper());
    }

    private LocalPrincipal marta() {
        return new LocalPrincipal(UUID.randomUUID(), UUID.randomUUID(), Cashier.Role.CAJERO, "Marta");
    }

    @Test
    @DisplayName("un token emitido se valida y devuelve el mismo cajero, tenant y rol")
    void ida_y_vuelta() {
        LocalPrincipal p = marta();
        String token = service.issue(p);

        Optional<LocalPrincipal> verified = service.verify(token);
        assertThat(verified).isPresent();
        assertThat(verified.get().cashierId()).isEqualTo(p.cashierId());
        assertThat(verified.get().tenantId()).isEqualTo(p.tenantId());
        assertThat(verified.get().role()).isEqualTo(Cashier.Role.CAJERO);
        assertThat(verified.get().name()).isEqualTo("Marta");
    }

    @Test
    @DisplayName("un token manipulado (payload o firma) no valida")
    void token_manipulado_no_valida() {
        String token = service.issue(marta());
        String payload = token.substring(0, token.indexOf('.'));
        String sig = token.substring(token.indexOf('.') + 1);

        // Firma cambiada.
        assertThat(service.verify(payload + "." + sig.substring(0, sig.length() - 2) + "XY")).isEmpty();
        // Payload cambiado (misma firma vieja).
        assertThat(service.verify("YWJj." + sig)).isEmpty();
        // Basura.
        assertThat(service.verify("no-es-un-token")).isEmpty();
        assertThat(service.verify("")).isEmpty();
        assertThat(service.verify(null)).isEmpty();
    }

    @Test
    @DisplayName("el secreto de una instalación no valida tokens de otra")
    void secretos_distintos_no_se_cruzan() {
        // Otro mock sin stubbing → genera su propio secreto fresco (distinto al de service).
        LocalSessionService otra = new LocalSessionService(mock(JdbcTemplate.class), new ObjectMapper());

        String token = service.issue(marta());
        assertThat(otra.verify(token)).isEmpty(); // otro secreto → firma no coincide
    }
}
