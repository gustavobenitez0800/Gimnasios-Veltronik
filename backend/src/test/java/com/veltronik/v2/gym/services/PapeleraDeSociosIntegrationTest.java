package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Borrar un socio manda a la papelera y no destruye nada (V80).
 *
 * <p><b>Por qué existe.</b> Hasta la V80, borrar un socio era {@code repository.delete}: un
 * DELETE de verdad que —por las FK con ON DELETE CASCADE— se llevaba también <b>toda su
 * historia de visitas</b>, y dejaba sus cobros huérfanos. Un click, sin deshacer, hecho por
 * quien atiende el mostrador con alguien esperando.</p>
 *
 * <p>Lo que se prueba acá son las dos mitades, y hacen falta las dos. Que el socio
 * <b>desaparezca</b> de todo lo que mira una pantalla no sirve si la fila se borró igual; y
 * que la fila <b>sobreviva</b> no sirve si el socio sigue apareciendo en el padrón o
 * abriendo la puerta.</p>
 */
@Transactional
@DisplayName("La papelera de socios")
class PapeleraDeSociosIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymMemberRepository repository;

    @Autowired
    private GymMemberService service;

    private UUID gym;
    private UUID socioId;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio con papelera', true)
                """).setParameter("id", gym).executeUpdate();
        TenantContextHolder.setTenantId(gym);

        GymMember m = new GymMember();
        m.setTenant(em.getReference(com.veltronik.v2.core.entities.Tenant.class, gym));
        m.setFirstName("Borrado");
        m.setLastName("Porerror");
        m.setEmail("borrado@test.local");
        m.setDocument("30.111.222");
        m.setActive(true);
        m.setMembershipEnd(LocalDateTime.now().plusDays(30));
        em.persist(m);
        em.flush();
        socioId = m.getId();
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /** Una visita y un cobro, que son lo que el borrado duro se llevaba puesto. */
    private void darleHistoria() {
        em.createNativeQuery("""
                INSERT INTO access_log (id, tenant_id, member_id, check_in_at, auto_closed,
                                        created_at, updated_at)
                VALUES (:id, :gym, :socio, now(), false, now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("gym", gym)
                .setParameter("socio", socioId)
                .executeUpdate();

        em.createNativeQuery("""
                INSERT INTO gym_payment (id, tenant_id, member_id, amount, payment_date, status,
                                         created_at, updated_at)
                VALUES (:id, :gym, :socio, 45000, now(), 'paid', now(), now())
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("gym", gym)
                .setParameter("socio", socioId)
                .executeUpdate();
        em.flush();
    }

    private long contar(String tabla) {
        return ((Number) em.createNativeQuery(
                        "SELECT count(*) FROM " + tabla + " WHERE member_id = :socio")
                .setParameter("socio", socioId)
                .getSingleResult()).longValue();
    }

    @Nested
    @DisplayName("el socio desaparece")
    class Desaparece {

        @Test
        @DisplayName("no está en el padrón, ni en el buscador, ni en los conteos")
        void noApareceEnNingunaPantalla() {
            assertEquals(1, repository.countByTenantIdAndDeletedAtIsNull(gym));

            service.deleteAndVerifyOwnership(socioId);
            em.flush();
            em.clear();

            assertEquals(0, repository.countByTenantIdAndDeletedAtIsNull(gym),
                    "El socio borrado sigue contando en el padrón.");
            assertTrue(repository.findByTenantIdAndDeletedAtIsNull(gym).isEmpty(),
                    "El socio borrado sigue apareciendo en el listado.");
            assertTrue(repository.searchByTenantId(gym, "Borrado",
                            org.springframework.data.domain.Pageable.unpaged()).isEmpty(),
                    "El socio borrado sigue apareciendo en el buscador.");
            assertEquals(0, repository.countByTenantIdAndDeletedAtIsNullAndIsActiveTrue(gym));
        }

        /**
         * ⭐ El que más importa: el molinete y el check-in por QR encuentran al socio por su
         * documento. Si un socio borrado sigue apareciendo acá, sigue entrando al gimnasio.
         */
        @Test
        @DisplayName("no abre la puerta: el documento deja de encontrarlo")
        void noEntraPorLaPuerta() {
            assertEquals(1, repository.findByDocumentoNormalizado(gym, "30111222").size());

            service.deleteAndVerifyOwnership(socioId);
            em.flush();
            em.clear();

            assertTrue(repository.findByDocumentoNormalizado(gym, "30111222").isEmpty(),
                    "Un socio borrado sigue abriendo la puerta con su documento.");
        }

        /**
         * La búsqueda por id NO pasa por ningún filtro —Hibernate no se lo aplica a una
         * búsqueda por clave primaria— así que el freno está puesto a mano en el servicio.
         * Por ahí pasan la ficha, la edición y el cobro.
         */
        @Test
        @DisplayName("no se lo puede abrir ni editar por id")
        void noSeLoPuedeAbrirPorId() {
            service.deleteAndVerifyOwnership(socioId);
            em.flush();
            em.clear();

            ResponseStatusException e = assertThrows(ResponseStatusException.class,
                    () -> service.findByIdAndVerifyOwnership(socioId));
            assertEquals(404, e.getStatusCode().value(),
                    "Un socio borrado tiene que responder 404, no dejarse abrir.");
        }
    }

    @Nested
    @DisplayName("pero no se pierde nada")
    class NoSePierdeNada {

        /**
         * ⭐ LA RAZÓN DE SER DE LA V80. Con el borrado duro, estas dos cuentas daban 0 y 1:
         * las visitas se iban por el CASCADE y el cobro quedaba sin dueño.
         */
        @Test
        @DisplayName("la visita y el cobro quedan enteros, y el cobro sigue siendo suyo")
        void laHistoriaSobrevive() {
            darleHistoria();
            assertEquals(1, contar("access_log"));
            assertEquals(1, contar("gym_payment"));

            service.deleteAndVerifyOwnership(socioId);
            em.flush();
            em.clear();

            assertEquals(1, contar("access_log"),
                    "El borrado se llevó puesta la historia de visitas del socio.");
            assertEquals(1, contar("gym_payment"),
                    "El cobro perdió a su dueño: quedó huérfano al borrar el socio.");
        }

        @Test
        @DisplayName("la fila sigue ahí, con fecha de borrado")
        void laFilaSigueAhi() {
            service.deleteAndVerifyOwnership(socioId);
            em.flush();
            em.clear();

            GymMember enPapelera = em.find(GymMember.class, socioId);
            assertNotNull(enPapelera, "La fila del socio se borró de verdad.");
            assertTrue(enPapelera.estaBorrado());
            assertEquals("Borrado", enPapelera.getFirstName(),
                    "Los datos del socio tienen que quedar intactos para poder recuperarlo.");
        }

        /** El camino de vuelta, que es lo que antes no existía. */
        @Test
        @DisplayName("se lo recupera poniendo deleted_at en NULL")
        void seLoPuedeRecuperar() {
            darleHistoria();
            service.deleteAndVerifyOwnership(socioId);
            em.flush();
            em.clear();

            em.createNativeQuery("UPDATE gym_member SET deleted_at = NULL WHERE id = :id")
                    .setParameter("id", socioId)
                    .executeUpdate();
            em.flush();
            em.clear();

            assertEquals(1, repository.countByTenantIdAndDeletedAtIsNull(gym),
                    "El socio recuperado tiene que volver al padrón.");
            assertEquals(1, contar("access_log"), "Y con su historia.");
            assertEquals(1, repository.findByDocumentoNormalizado(gym, "30111222").size(),
                    "Y volviendo a abrir la puerta.");
        }
    }
}
