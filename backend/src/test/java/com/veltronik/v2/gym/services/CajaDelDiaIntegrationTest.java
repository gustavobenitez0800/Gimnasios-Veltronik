package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
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
    @DisplayName("cobrar de las tres formas y cerrar el dia: el sistema pone los numeros")
    void elDiaCompleto() {
        cobrar("40000", "CASH");
        cobrar("45000", "TRANSFER");
        cobrar("45000", "MERCADOPAGO");

        // Nadie declara nada: cada cobro ya trae su forma de pago.
        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla");

        assertEquals(0, c.getEsperadoEfectivo().compareTo(new BigDecimal("40000")));
        assertEquals(0, c.getEsperadoTransferencia().compareTo(new BigDecimal("45000")));
        assertEquals(0, c.getEsperadoMercadopago().compareTo(new BigDecimal("45000")),
                "Mercado Pago no puede caer en otros");
        assertEquals(3, c.getCantidadCobros());
        assertEquals(0, c.getQuedaEnCaja().compareTo(new BigDecimal("40000")),
                "sin retiro, en el cajon queda lo cobrado en efectivo");
    }

    /**
     * ⭐ LA CADENA DE LOS DIAS.
     *
     * <p>Lo que queda en el cajon hoy es el fondo de manana. Es lo que permitio borrar el
     * paso de "abrir caja": ese numero ya no lo tiene que recordar nadie a la manana. Y es
     * la unica parte del modelo nuevo que no se puede probar mirando un solo cierre.</p>
     */
    @Test
    @Transactional
    @DisplayName("lo que queda en el cajon hoy es el fondo con el que arranca manana")
    void elCajonSeEncadenaDeUnDiaAlOtro() {
        cobrar("40000", "CASH");
        CajaCierre hoy = cajaService.cerrar(new BigDecimal("30000"), null, "Carla");
        assertEquals(0, hoy.getQuedaEnCaja().compareTo(new BigDecimal("10000")));

        // Al dia siguiente, sin abrir nada: el fondo ya esta.
        assertEquals(0, cajaService.fondoActual().compareTo(new BigDecimal("10000")));

        cobrar("25000", "CASH");
        CajaCierre manana = cajaService.cerrar(BigDecimal.ZERO, null, "Carla");

        assertEquals(0, manana.getFondoInicial().compareTo(new BigDecimal("10000")),
                "el cambio de ayer sigue en el cajon");
        assertEquals(0, manana.getQuedaEnCaja().compareTo(new BigDecimal("35000")),
                "10.000 que quedaron + 25.000 cobrados hoy");
    }

    @Test
    @Transactional
    @DisplayName("no se puede retirar mas de lo que hay en el cajon")
    void noSePuedeVaciarDeMas() {
        cobrar("40000", "CASH");

        assertThrows(ResponseStatusException.class,
                () -> cajaService.cerrar(new BigDecimal("100000"), null, "Carla"));
    }

    @Test
    @Transactional
    @DisplayName("lo cobrado despues del ultimo cierre NO se pierde")
    void loCobradoDespuesDelCierreSeCuenta() {
        // Con el modelo viejo esto dependia de que alguien se acordara de abrir la caja: lo
        // cobrado antes de la apertura no lo contaba nadie. Ahora el periodo arranca solo,
        // donde termino el cierre anterior.
        cobrar("40000", "CASH");

        CajaCierre c = cajaService.cerrar(BigDecimal.ZERO, null, "Carla");

        assertEquals(1, c.getCantidadCobros());
        assertEquals(0, c.getEsperadoEfectivo().compareTo(new BigDecimal("40000")));
    }

    @Test
    @Transactional
    @DisplayName("los cobros del periodo se pueden listar, con monto y metodo")
    void seVeDeDondeSaleElNumero() {
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
    @DisplayName("el balance del dia sale de los cobros de hoy")
    void elBalanceDelDia() {
        cobrar("40000", "CASH");
        cobrar("45000", "TRANSFER");

        var hoy = cajaService.balance(false);

        assertEquals(2, hoy.cantidadCobros());
        assertEquals(0, hoy.efectivo().compareTo(new BigDecimal("40000")));
        assertEquals(0, hoy.digital().compareTo(new BigDecimal("45000")));
    }

    /**
     * El balance de calendario NO es el periodo abierto. Si nadie cerro ayer, el periodo
     * arrastra dos dias y el balance de hoy tiene que seguir diciendo lo de hoy.
     */
    @Test
    @Transactional
    @DisplayName("el balance del mes incluye lo del dia")
    void elBalanceDelMesIncluyeElDia() {
        cobrar("40000", "CASH");

        var mes = cajaService.balance(true);

        assertTrue(mes.cantidadCobros() >= 1);
        assertTrue(mes.efectivo().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    @Transactional
    @DisplayName("un cobro pendiente no entra: no puso plata en ningun lado")
    void elPendienteNoCuenta() {
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
