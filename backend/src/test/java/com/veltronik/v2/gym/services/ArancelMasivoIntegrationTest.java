package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
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
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Asignar el arancel a muchos socios de una sola vez.
 *
 * <p><b>Por qué esto vive en el servidor y no en un bucle del navegador.</b> El gimnasio
 * tiene 383 socios sin arancel. Hacerlo con 383 pedidos desde la pantalla significa 383
 * viajes, más de un minuto de espera, y —lo grave— que cerrar la pestaña a la mitad deja
 * la mitad hecha, sin forma de saber cuál. Acá es UNA operación: se aplica entera o no se
 * aplica.</p>
 *
 * <p>Estos tests corren contra PostgreSQL de verdad porque lo que se prueba es justamente
 * lo que un mock no puede prometer: que la escritura sea real, acotada al gimnasio, y que
 * no se filtre a socios de otro.</p>
 */
class ArancelMasivoIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymMemberService memberService;

    private UUID gym;
    private UUID otroGym;
    private UUID arancel;
    private UUID arancelAjeno;

    private UUID crearGimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :n, true)
                """).setParameter("id", id).setParameter("n", nombre).executeUpdate();
        return id;
    }

    private UUID crearArancel(UUID tenant, String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_plans (id, tenant_id, name, price, duration_days, is_active,
                                       created_at, updated_at)
                VALUES (:id, :t, :n, :p, 30, true, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant)
                .setParameter("n", nombre).setParameter("p", new BigDecimal("45000"))
                .executeUpdate();
        return id;
    }

    private UUID crearSocio(UUID tenant, String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :t, :n, 'Prueba', :mail, :doc, true, now(), now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant).setParameter("n", nombre)
                .setParameter("mail", id + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .executeUpdate();
        return id;
    }

    /** El arancel que quedó guardado, leído de la base y no del objeto en memoria. */
    private Object arancelDe(UUID socio) {
        em.flush();
        em.clear();
        return em.createNativeQuery("SELECT plan_id FROM gym_members WHERE id = :id")
                .setParameter("id", socio).getSingleResult();
    }

    @BeforeEach
    void sembrar() {
        gym = crearGimnasio("Gimnasio Uno");
        otroGym = crearGimnasio("Gimnasio Dos");
        arancel = crearArancel(gym, "Mensual");
        arancelAjeno = crearArancel(otroGym, "Mensual del otro");
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    // ⭐ EL CASO REAL: cientos de socios sin arancel, y hay que asignarlo.
    @Test
    @Transactional
    @DisplayName("asigna el arancel a todos los socios de la lista, en una sola operacion")
    void asignaATodos() {
        List<UUID> socios = List.of(
                crearSocio(gym, "Ana"), crearSocio(gym, "Beto"), crearSocio(gym, "Carla"));
        em.flush();

        int tocados = memberService.asignarArancelMasivo(socios, arancel);

        assertEquals(3, tocados);
        for (UUID s : socios) {
            assertEquals(arancel, arancelDe(s));
        }
    }

    /**
     * ⚠️ EL AGUJERO QUE ESTO CIERRA.
     *
     * <p>Una operación masiva que reciba una lista de ids es exactamente el lugar donde se
     * cuela un id de otro gimnasio. Si no se acota por tenant, un pedido armado a mano
     * puede escribir sobre socios ajenos — y encima en masa.</p>
     */
    @Test
    @Transactional
    @DisplayName("NO toca socios de otro gimnasio, aunque manden su id")
    void noTocaSociosAjenos() {
        UUID mio = crearSocio(gym, "Ana");
        UUID ajeno = crearSocio(otroGym, "Del otro gimnasio");
        em.flush();

        int tocados = memberService.asignarArancelMasivo(List.of(mio, ajeno), arancel);

        assertEquals(1, tocados, "solo el socio propio");
        assertEquals(arancel, arancelDe(mio));
        assertNull(arancelDe(ajeno), "el socio ajeno tiene que quedar intacto");
    }

    @Test
    @Transactional
    @DisplayName("NO acepta un arancel de otro gimnasio")
    void noAceptaArancelAjeno() {
        // Sin esto, un socio quedaría apuntando al arancel de otro negocio: le cobrarían un
        // precio que su gimnasio no vende.
        UUID mio = crearSocio(gym, "Ana");
        em.flush();

        assertThrows(ResponseStatusException.class,
                () -> memberService.asignarArancelMasivo(List.of(mio), arancelAjeno));
    }

    @Test
    @Transactional
    @DisplayName("con arancel null se lo SACA a todos")
    void sacarElArancel() {
        // Es la operación inversa y hace falta: el dueño se equivoca de arancel al aplicarlo
        // a 200 socios y necesita poder deshacerlo sin abrir 200 fichas.
        UUID a = crearSocio(gym, "Ana");
        em.flush();
        memberService.asignarArancelMasivo(List.of(a), arancel);

        int tocados = memberService.asignarArancelMasivo(List.of(a), null);

        assertEquals(1, tocados);
        assertNull(arancelDe(a));
    }

    @Test
    @Transactional
    @DisplayName("una lista vacia no hace nada y no rompe")
    void listaVacia() {
        assertEquals(0, memberService.asignarArancelMasivo(List.of(), arancel));
        assertEquals(0, memberService.asignarArancelMasivo(null, arancel));
    }

    @Test
    @Transactional
    @DisplayName("no se aceptan listas descomunales")
    void demasiados() {
        // Un tope existe para que un pedido armado a mano no pueda pedir una escritura sobre
        // la tabla entera. El limite es holgado para el gimnasio mas grande que esperamos.
        List<UUID> muchos = new java.util.ArrayList<>();
        for (int i = 0; i < 2001; i++) muchos.add(UUID.randomUUID());

        assertThrows(ResponseStatusException.class,
                () -> memberService.asignarArancelMasivo(muchos, arancel));
    }

    @Test
    @Transactional
    @DisplayName("asignar el arancel NO toca ningun otro dato del socio")
    void noPisaOtrosCampos() {
        // La operación masiva escribe UNA columna. Si mandara el socio entero, cualquier
        // campo que no viniera se borraría — y en masa.
        UUID a = crearSocio(gym, "Ana");
        em.flush();

        memberService.asignarArancelMasivo(List.of(a), arancel);
        em.flush();
        em.clear();

        Object[] fila = (Object[]) em.createNativeQuery(
                        "SELECT first_name, document, is_active FROM gym_members WHERE id = :id")
                .setParameter("id", a).getSingleResult();
        assertEquals("Ana", fila[0]);
        assertEquals(Boolean.TRUE, fila[2]);
    }
}
