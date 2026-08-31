package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Un pago SIN socio tiene que poder abrirse y borrarse.
 *
 * <p><b>El bug:</b> {@code gym_payments.member_id} es nullable a propósito y la FK es
 * {@code ON DELETE SET NULL} — borrar un socio deja sus pagos como huérfanos para que la
 * contabilidad no se evapore. Pero la entidad los mapeaba con
 * {@code @JoinColumn(nullable = false)}, y de ahí Hibernate deduce {@code optional = false}
 * y arma un <b>INNER JOIN</b> contra {@code gym_members} al hacer {@code findById}. Con
 * {@code member_id} en NULL el join no devuelve fila y el pago responde <b>404</b>.</p>
 *
 * <p>El síntoma era desconcertante: el pago aparecía en el listado (esa consulta usa
 * {@code LEFT JOIN FETCH} explícito) y sumaba en los totales, pero no se podía abrir ni
 * borrar. En HaA Fitness quedaron 13 pagos así, por $510.000.</p>
 *
 * <p>Se siembra con SQL crudo a propósito: guardar por JPA no sirve para reproducirlo,
 * porque el mapeo roto es justamente el que impide escribir el NULL.</p>
 */
class GymPaymentHuerfanoTest extends EmbeddedPostgresTest {

    @Autowired
    private GymPaymentRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    @DisplayName("un pago cuyo socio fue borrado se sigue pudiendo leer por id")
    void pagoSinSocioSeEncuentraPorId() {
        UUID tenantId = UUID.randomUUID();
        UUID pagoId = UUID.randomUUID();
        LocalDateTime ahora = LocalDateTime.now();

        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                tenantId, ahora, ahora, "Gimnasio del test", "GYM");
        jdbc.update("INSERT INTO gym_payments (id, tenant_id, member_id, amount, payment_date, status, created_at, updated_at) "
                        + "VALUES (?,?,NULL,?,?,?,?,?)",
                pagoId, tenantId, new BigDecimal("45000.00"), ahora, "paid", ahora, ahora);

        Optional<GymPayment> encontrado = repository.findById(pagoId);

        assertThat(encontrado)
                .as("el pago existe en la tabla; si el mapeo lo busca con INNER JOIN, member_id NULL lo esconde")
                .isPresent();
        assertThat(encontrado.get().getMember()).isNull();
        assertThat(encontrado.get().getAmount()).isEqualByComparingTo("45000.00");
    }
}
