package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.controllers.GymMemberController;
import com.veltronik.v2.gym.dto.GymMemberInputDTO;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * ⭐ EL ALTA CON EL ID QUE TRAE EL TERMINAL, y la guarda que la vuelve segura.
 *
 * <p><b>Por qué el id puede venir de afuera.</b> En el mostrador se da de alta y se cobra en el
 * mismo acto. Sin conexión las dos cosas van a la cola, y el cobro tiene que poder nombrar al
 * socio: si el id lo inventara el servidor, el cobro encolado apuntaría a alguien que todavía no
 * existe.</p>
 *
 * <p><b>⚠️ Y por qué eso es peligroso si no se cuida.</b> Un id que viene del cliente es un id
 * que el cliente eligió. El {@code save} de JPA con id no nulo hace <b>merge</b>, no falla: sin
 * la guarda, mandar el UUID de un socio de OTRO gimnasio le sobrescribe la ficha y se la lleva
 * puesta a este tenant. Ese es el test que sigue.</p>
 */
@Transactional
class AltaConIdDelTerminalIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymMemberController controller;

    private UUID gym;
    private UUID otroGym;

    @BeforeEach
    void sembrar() {
        gym = crearGimnasio("Gimnasio del alta");
        otroGym = crearGimnasio("Gimnasio ajeno");
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    private UUID crearGimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :nombre, true)
                """).setParameter("id", id).setParameter("nombre", nombre).executeUpdate();
        return id;
    }

    private void socioDeOtroGimnasio(UUID id, String nombre) {
        em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, created_at, updated_at)
                VALUES (:id, :gym, :nombre, 'Ajeno', :email, :doc, true, now(), now())
                """)
                .setParameter("id", id).setParameter("gym", otroGym)
                .setParameter("nombre", nombre)
                .setParameter("email", id + "@ajeno.com")
                .setParameter("doc", id.toString().substring(0, 8))
                .executeUpdate();
        em.flush();
    }

    private GymMemberInputDTO alta(UUID id, String nombre) {
        GymMemberInputDTO in = new GymMemberInputDTO();
        in.setId(id);
        in.setFirstName(nombre);
        in.setLastName("De Prueba");
        in.setDocument(UUID.randomUUID().toString().substring(0, 8));
        return in;
    }

    @Test
    @DisplayName("⭐ el terminal manda su id y el socio se crea con ESE id")
    void elIdDelTerminalSeRespeta() {
        // Es lo que permite encolar el cobro detrás del alta: el cobro ya sabe a quién nombrar.
        UUID id = UUID.randomUUID();

        var r = controller.createMember(alta(id, "Nuevo"));

        assertEquals(id, r.getBody().getId(), "sin esto, el cobro encolado apunta a nadie");
    }

    @Test
    @DisplayName("el alta reintentada devuelve el socio que ya está, sin pisarle nada")
    void elReintentoNoPisa() {
        UUID id = UUID.randomUUID();
        controller.createMember(alta(id, "Nuevo"));

        // Alguien le corrigió el nombre después de que el alta subiera.
        em.createNativeQuery("UPDATE gym_member SET first_name = 'Corregido' WHERE id = :id")
                .setParameter("id", id).executeUpdate();
        em.flush();
        em.clear();

        var r = controller.createMember(alta(id, "Nuevo"));

        assertEquals("Corregido", r.getBody().getFullName().split(" ")[0],
                "un alta que se mandó dos veces no puede devolver la ficha a como estaba");
    }

    @Test
    @DisplayName("⚠️⚠️ el id de un socio de OTRO gimnasio se rechaza, no se sobrescribe")
    void noSePuedeRobarElIdDeOtroGimnasio() {
        // SIN ESTA GUARDA el `save` de JPA hace merge: le sobrescribe la ficha al socio ajeno y
        // se la lleva puesta a este tenant. Es la diferencia entre "puedo elegir mi id" y
        // "puedo elegir el de cualquiera".
        UUID ajeno = UUID.randomUUID();
        socioDeOtroGimnasio(ajeno, "Victima");

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> controller.createMember(alta(ajeno, "Intruso")));

        assertEquals(HttpStatus.CONFLICT, e.getStatusCode());

        // Y sobre todo: el socio ajeno quedó intacto y en su gimnasio.
        em.clear();
        Object[] fila = (Object[]) em.createNativeQuery(
                        "SELECT first_name, tenant_id FROM gym_member WHERE id = :id")
                .setParameter("id", ajeno).getSingleResult();
        assertEquals("Victima", fila[0]);
        assertEquals(otroGym, fila[1]);
    }

    @Test
    @DisplayName("sin id, todo sigue como siempre: lo genera el servidor")
    void sinIdLoGeneraElServidor() {
        GymMemberInputDTO in = alta(null, "Con conexión");

        var r = controller.createMember(in);

        assertEquals(true, r.getBody().getId() != null);
    }
}
