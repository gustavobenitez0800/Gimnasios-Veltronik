package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.CajaSesion;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El día completo de una caja, contra PostgreSQL de verdad.
 *
 * <p>Los tests con mocks prueban las decisiones; este prueba que la cosa entera funcione:
 * abrir, cobrar, contar, cerrar y volver a abrir. Y sobre todo prueba la garantía que NO
 * está en el código sino en la base: que no puedan existir dos cajas abiertas a la vez.</p>
 */
class CajaDelDiaIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private CajaService cajaService;

    /** El mismo reloj que usa el servicio. La base responde en el suyo, que no tiene por que coincidir. */
    private static final ZoneId RELOJ = ZoneId.of("America/Argentina/Buenos_Aires");

    private UUID gym;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio Caja', true)
                """).setParameter("id", gym).executeUpdate();

        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, 'Lurdes', 'Rollet', :mail, :doc, true, now(), now(), now())
                """)
                .setParameter("id", socio)
                .setParameter("t", gym)
                .setParameter("mail", socio + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .executeUpdate();

        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    private void cobrar(String monto, String metodo) {
        em.createNativeQuery("""
                INSERT INTO gym_payments (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :monto, :metodo, 'paid', :cuando, now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("t", gym)
                .setParameter("m", socio)
                .setParameter("monto", new BigDecimal(monto))
                .setParameter("metodo", metodo)
                .setParameter("cuando", LocalDateTime.now(RELOJ))
                .executeUpdate();
        em.flush();
    }

    // EL DIA COMPLETO, TAL COMO PASA EN EL MOSTRADOR
    @Test
    @Transactional
    @DisplayName("abrir con cambio, cobrar de las tres formas, contar y cerrar: cuadra")
    void elDiaCompleto() {
        CajaSesion s = cajaService.abrir(new BigDecimal("10000"), "Carla");
        assertTrue(s.estaAbierta());

        cobrar("40000", "CASH");
        cobrar("45000", "TRANSFER");
        cobrar("45000", "MERCADOPAGO");

        // En el cajon: los 10.000 de cambio mas los 40.000 cobrados en efectivo.
        // En el banco y en MP: 45.000 + 45.000.
        CajaCierre c = cajaService.cerrar(new BigDecimal("50000"), new BigDecimal("90000"),
                null, "Carla", false);

        assertEquals(0, c.getDiferencia().signum(),
                "el efectivo tiene que cuadrar CON el fondo adentro");
        assertEquals(0, c.getDiferenciaDigital().signum(), "transferencia mas Mercado Pago");
        assertEquals(0, c.getEsperadoEfectivo().compareTo(new BigDecimal("40000")));
        assertEquals(0, c.getFondoInicial().compareTo(new BigDecimal("10000")));
        assertEquals(0, c.getEsperadoMercadopago().compareTo(new BigDecimal("45000")),
                "Mercado Pago no puede caer en otros");
        assertEquals(3, c.getCantidadCobros());
    }

    /**
     * LA GARANTIA QUE NO ESTA EN EL CODIGO.
     *
     * <p>El gimnasio puede tener la notebook con la web y la PC del mostrador con el
     * escritorio. Si las dos abren caja hay dos periodos pisandose, y la plata se cuenta dos
     * veces o ninguna. El chequeo en Java no alcanza: las dos terminales pueden preguntar en
     * el mismo instante y las dos ver "no hay ninguna abierta". Lo que lo impide de verdad es
     * el indice unico parcial de la V59.</p>
     */
    @Test
    @Transactional
    @DisplayName("no puede haber dos cajas abiertas en el mismo gimnasio")
    void unaSolaCajaAbierta() {
        cajaService.abrir(new BigDecimal("10000"), "Carla");

        assertThrows(ResponseStatusException.class,
                () -> cajaService.abrir(new BigDecimal("5000"), "Otra terminal"));
    }

    @Test
    @Transactional
    @DisplayName("cerrar libera la caja: despues se puede abrir otra")
    void despuesDeCerrarSePuedeAbrirDeNuevo() {
        cajaService.abrir(new BigDecimal("10000"), "Carla");
        cobrar("40000", "CASH");
        cajaService.cerrar(new BigDecimal("50000"), BigDecimal.ZERO, null, "Carla", false);

        assertTrue(cajaService.sesionAbierta().isEmpty(),
                "si queda abierta, nadie puede abrir otra nunca mas");

        CajaSesion nueva = cajaService.abrir(new BigDecimal("50000"), "Turno noche");
        assertTrue(nueva.estaAbierta());
    }

    @Test
    @Transactional
    @DisplayName("lo cobrado antes de abrir la caja NO se pierde")
    void loCobradoConLaCajaCerradaSeCuenta() {
        // Nadie abrio la caja a la manana, pero se cobro igual. Esa plata esta en el cajon y
        // tiene que entrar en el proximo cierre: si no, desaparece sin que nadie lo note.
        cobrar("40000", "CASH");

        CajaCierre c = cajaService.cerrar(new BigDecimal("40000"), BigDecimal.ZERO, null, "Carla", false);

        assertEquals(1, c.getCantidadCobros());
        assertEquals(0, c.getDiferencia().signum());
    }

    @Test
    @Transactional
    @DisplayName("los cobros del periodo se pueden listar, con monto y metodo")
    void seVeDeDondeSaleElNumero() {
        cajaService.abrir(BigDecimal.ZERO, "Carla");
        cobrar("40000", "CASH");
        cobrar("45000", "TRANSFER");

        var movs = cajaService.movimientosDelPeriodo();

        assertEquals(2, movs.size(),
                "un total que no se puede abrir es un numero en el que hay que creer");
        assertTrue(movs.stream().anyMatch(p -> "CASH".equals(p.getPaymentMethod())));
        assertTrue(movs.stream().allMatch(p -> p.getMember() != null),
                "el socio tiene que venir cargado: la pantalla lo muestra");
    }

    @Test
    @Transactional
    @DisplayName("un cobro pendiente no entra: no puso plata en ningun lado")
    void elPendienteNoCuenta() {
        cajaService.abrir(BigDecimal.ZERO, "Carla");
        cobrar("40000", "CASH");
        em.createNativeQuery("""
                INSERT INTO gym_payments (id, tenant_id, member_id, amount, payment_method, status,
                                          payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, 99999, 'CASH', 'pending', :cuando, now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("t", gym)
                .setParameter("m", socio)
                .setParameter("cuando", LocalDateTime.now(RELOJ))
                .executeUpdate();
        em.flush();

        assertEquals(1, cajaService.movimientosDelPeriodo().size());
    }
}
