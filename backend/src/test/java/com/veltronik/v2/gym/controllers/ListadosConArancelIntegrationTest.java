package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 🔴 EL BUG QUE ESTOS TESTS DEFIENDEN: LA LISTA DE SOCIOS SE CAÍA CON UN 500.
 *
 * <p>Apareció el 2026-09-03 apenas se cargaron datos de prueba con aranceles asignados.
 * Hasta ese día NINGÚN socio tenía arancel, así que nadie lo había visto — y por eso pudo
 * llegar a producción sin que se notara.</p>
 *
 * <p><b>La mecánica.</b> {@code GymMember.plan} es {@code @ManyToOne(fetch = LAZY)} y el DTO
 * se arma en el CONTROLADOR, o sea fuera de la transacción del servicio. Con
 * {@code spring.jpa.open-in-view=false} (que es como corre este backend), al salir del
 * servicio la sesión de Hibernate ya está cerrada: cuando el mapper pide
 * {@code plan.getName()} para llenar {@code planNombre}, salta LazyInitializationException y
 * el request entero termina en 500.</p>
 *
 * <p>Con un socio sin arancel no pasa nada: no hay proxy que inicializar. Basta UN socio con
 * arancel para que se caiga <b>la lista entera</b> — la pantalla de Socios queda inutilizable
 * para todo el gimnasio.</p>
 *
 * <p><b>Por qué la prueba corre contra Postgres de verdad y no con mocks:</b> lo que falla es
 * exactamente lo que un mock no puede reproducir — el ciclo de vida de la sesión de Hibernate.
 * Un test con repositorios simulados pasa siempre y no habría visto nada.</p>
 *
 * <p>⚠️ Estos tests llaman al CONTROLADOR a propósito, y sin {@code @Transactional}. Poner
 * la anotación acá dejaría la sesión abierta durante toda la prueba y taparía el bug: pasaría
 * en verde con el código roto. Es la misma trampa que dejó pasar el problema.</p>
 */
class ListadosConArancelIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymMemberController memberController;

    // El endpoint de pagos exige rol (@PreAuthorize) y este test no monta un SecurityContext:
    // se usa el MISMO camino que el controlador —servicio + mapper— que es donde vive el bug.
    // El guardia de permisos es otra cosa y tiene sus propios tests.
    @Autowired
    private com.veltronik.v2.gym.services.GymPaymentService paymentService;

    @Autowired
    private com.veltronik.v2.gym.mappers.GymPaymentMapper paymentMapper;

    private UUID gym;
    private UUID arancel;

    private UUID crearGimnasio() {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio de prueba', true)
                """).setParameter("id", id).executeUpdate();
        return id;
    }

    private UUID crearArancel(UUID tenant) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_plans (id, tenant_id, name, price, duration_days, is_active,
                                       created_at, updated_at)
                VALUES (:id, :t, 'Mensual', :p, 30, true, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant)
                .setParameter("p", new BigDecimal("25000"))
                .executeUpdate();
        return id;
    }

    /** @param plan el arancel del socio, o null para uno sin arancel. */
    private UUID crearSocio(UUID tenant, String nombre, UUID plan) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, plan_id, created_at, updated_at)
                VALUES (:id, :t, :n, 'Prueba', :mail, :doc, true, now() + interval '20 days',
                        :plan, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant).setParameter("n", nombre)
                .setParameter("mail", id + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("plan", plan)
                .executeUpdate();
        return id;
    }

    private void crearPago(UUID tenant, UUID socio, UUID plan) {
        em.createNativeQuery("""
                INSERT INTO gym_payments (id, tenant_id, member_id, plan_id, amount, payment_method,
                                          status, payment_date, created_at, updated_at)
                VALUES (:id, :t, :m, :plan, 25000, 'CASH', 'PAID', now(), now(), now())
                """)
                .setParameter("id", UUID.randomUUID()).setParameter("t", tenant)
                .setParameter("m", socio).setParameter("plan", plan)
                .executeUpdate();
    }

    @Autowired
    private PlatformTransactionManager txManager;

    private TransactionTemplate tx;

    /**
     * ⚠️ Se siembra en una transacción PROPIA, que commitea. El test en sí corre sin
     * transacción a propósito: es la única forma de reproducir la sesión ya cerrada que
     * hace saltar el lazy. Con @Transactional en la clase, estos tests pasarían en verde
     * incluso con el código roto.
     */
    @BeforeEach
    void sembrar() {
        tx = new TransactionTemplate(txManager);
        tx.executeWithoutResult(st -> {
            gym = crearGimnasio();
            arancel = crearArancel(gym);
        });
        TenantContextHolder.setTenantId(gym);
    }

    /** Como el sembrado commitea, hay que barrer: si no, cada test le deja basura al siguiente. */
    @AfterEach
    void limpiar() {
        tx.executeWithoutResult(st -> {
            em.createNativeQuery("DELETE FROM gym_payments WHERE tenant_id = :t").setParameter("t", gym).executeUpdate();
            em.createNativeQuery("DELETE FROM gym_members WHERE tenant_id = :t").setParameter("t", gym).executeUpdate();
            em.createNativeQuery("DELETE FROM gym_plans WHERE tenant_id = :t").setParameter("t", gym).executeUpdate();
            em.createNativeQuery("DELETE FROM tenant WHERE id = :t").setParameter("t", gym).executeUpdate();
        });
        TenantContextHolder.clear();
    }

    /** Crea los datos del caso dentro de una transacción que commitea. */
    private void dado(Runnable pasos) {
        tx.executeWithoutResult(st -> pasos.run());
    }

    /**
     * ⭐ EL TEST DEL BUG. Sin el arreglo esto explota con LazyInitializationException, que es
     * el 500 que veía la pantalla.
     */
    @Test
    @DisplayName("🔴 la lista de socios NO se cae cuando alguno tiene arancel")
    void listaDeSociosConArancel() {
        dado(() -> {
            crearSocio(gym, "Camila", arancel);
            crearSocio(gym, "Bruno", null);   // uno sin arancel: los dos casos conviven
        });

        List<GymMemberDTO> socios = memberController.getAllMembers().getBody();

        assertNotNull(socios);
        assertEquals(2, socios.size());
        GymMemberDTO conArancel = socios.stream()
                .filter(s -> "Camila".equals(s.getFirstName())).findFirst().orElseThrow();
        assertEquals(arancel, conArancel.getPlanId());
        assertEquals("Mensual", conArancel.getPlanNombre(),
                "el nombre del arancel tiene que viajar: es lo que la lista muestra en su columna");
    }

    @Test
    @DisplayName("🔴 la lista PAGINADA tampoco se cae (es la que usa la pantalla)")
    void listaPaginadaConArancel() {
        dado(() -> crearSocio(gym, "Camila", arancel));

        var pagina = memberController.getMembersPaged(0, 25, null).getBody();

        assertNotNull(pagina);
        assertEquals(1, pagina.content().size());
        assertEquals("Mensual", pagina.content().get(0).getPlanNombre());
    }

    @Test
    @DisplayName("🔴 la búsqueda por nombre tampoco (mismo camino, mismo mapeo)")
    void busquedaConArancel() {
        dado(() -> crearSocio(gym, "Camila", arancel));

        var pagina = memberController.getMembersPaged(0, 25, "Cami").getBody();

        assertNotNull(pagina);
        assertEquals(1, pagina.content().size());
        assertEquals("Mensual", pagina.content().get(0).getPlanNombre());
    }

    /**
     * Los pagos tienen la misma relación lazy al arancel, y su consulta traía el socio pero
     * NO el plan. Cobrar con arancel —que es lo normal desde que existen— rompía la pantalla
     * de Pagos igual que la de Socios.
     */
    @Test
    @DisplayName("🔴 la lista de pagos NO se cae cuando el cobro tiene arancel")
    void listaDePagosConArancel() {
        dado(() -> {
            UUID socio = crearSocio(gym, "Camila", arancel);
            crearPago(gym, socio, arancel);
        });

        var pagos = paymentMapper.toDtoList(paymentService.findAllForCurrentTenant());

        assertNotNull(pagos);
        assertEquals(1, pagos.size());
        assertNotNull(pagos.get(0).getPlan(),
                "el arancel del cobro tiene que viajar resuelto, no como proxy sin sesión");
        assertEquals("Mensual", pagos.get(0).getPlan().getName());
    }
}
