package com.veltronik.v2.core.services;

import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El puente entre Supabase Auth y las tablas de Veltronik.
 *
 * <p><b>El problema que fija este test:</b> borrar un usuario a mano desde el panel de Supabase
 * <i>quemaba su correo para siempre</i>. El trigger de la V11 era solo AFTER INSERT, así que la
 * ficha de {@code app_user} quedaba colgada; como {@code email} es UNIQUE, el alta siguiente con
 * ese mismo correo hacía fallar el trigger — y al correr dentro de la transacción del alta,
 * Supabase directamente no podía crear la cuenta.</p>
 *
 * <p>Lo peor no era el huérfano: era que el trigger, al fallar, <b>bloqueaba</b> el alta con un
 * error que no mencionaba nada de esto.</p>
 *
 * <p>Se prueba contra Postgres de verdad y no con mocks porque lo que se está probando ES la
 * base: un trigger, una restricción UNIQUE y una clave foránea. Nada de eso existe en un mock.</p>
 */
class AuthUserSyncIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    /** Simula lo que hace Supabase al registrar a alguien: insertar en auth.users. */
    private void alta(UUID id, String email) {
        em.createNativeQuery("INSERT INTO auth.users (id, email) VALUES (:id, :email)")
                .setParameter("id", id)
                .setParameter("email", email)
                .executeUpdate();
        em.flush();
    }

    private long fichasCon(String email) {
        return ((Number) em.createNativeQuery(
                        "SELECT COUNT(*) FROM app_user WHERE lower(email) = lower(:email)")
                .setParameter("email", email)
                .getSingleResult()).longValue();
    }

    @Test
    @Transactional
    @DisplayName("el alta normal crea la ficha en app_user")
    void altaNormalCreaFicha() {
        String email = "alta-normal-" + UUID.randomUUID() + "@test.com";
        alta(UUID.randomUUID(), email);

        assertEquals(1, fichasCon(email));
    }

    @Test
    @Transactional
    @DisplayName("un correo borrado a mano en Supabase se puede volver a usar")
    void elCorreoNoQuedaQuemado() {
        String email = "reciclado-" + UUID.randomUUID() + "@test.com";
        UUID viejo = UUID.randomUUID();

        // 1. Alguien se registra…
        alta(viejo, email);
        assertEquals(1, fichasCon(email));

        // 2. …y el dueño lo borra a mano DESDE EL PANEL DE SUPABASE, que es el caso real.
        em.createNativeQuery("DELETE FROM auth.users WHERE id = :id")
                .setParameter("id", viejo).executeUpdate();
        em.flush();

        // 3. Se vuelve a crear la cuenta con el MISMO correo. Antes de la V48, esto explotaba
        //    contra el UNIQUE de email y Supabase no podía crear el usuario.
        UUID nuevo = UUID.randomUUID();
        alta(nuevo, email);

        // Queda UNA sola ficha, y es la del usuario nuevo.
        assertEquals(1, fichasCon(email), "no puede quedar la ficha vieja conviviendo con la nueva");
        Object idFicha = em.createNativeQuery(
                        "SELECT id FROM app_user WHERE lower(email) = lower(:email)")
                .setParameter("email", email).getSingleResult();
        assertEquals(nuevo, idFicha, "la ficha tiene que apuntar al usuario NUEVO, no al borrado");
    }

    @Test
    @Transactional
    @DisplayName("el huérfano se limpia aunque tenga membresías colgando")
    void limpiaAunqueTengaMembresias() {
        String email = "con-membresia-" + UUID.randomUUID() + "@test.com";
        UUID viejo = UUID.randomUUID();
        UUID tenant = UUID.randomUUID();

        alta(viejo, email);

        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio de prueba', true)
                """).setParameter("id", tenant).executeUpdate();
        em.createNativeQuery("""
                INSERT INTO tenant_membership (id, created_at, updated_at, user_id, tenant_id, role, is_active)
                VALUES (:id, now(), now(), :user, :tenant, 'OWNER', true)
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("user", viejo)
                .setParameter("tenant", tenant)
                .executeUpdate();
        em.flush();

        // Borrado a mano y alta de nuevo. tenant_membership apunta a app_user SIN cascada, así
        // que sin la limpieza explícita de membresías esto fallaría por la clave foránea.
        em.createNativeQuery("DELETE FROM auth.users WHERE id = :id")
                .setParameter("id", viejo).executeUpdate();
        em.flush();

        alta(UUID.randomUUID(), email);

        assertEquals(1, fichasCon(email));
        long membresiasViejas = ((Number) em.createNativeQuery(
                        "SELECT COUNT(*) FROM tenant_membership WHERE user_id = :id")
                .setParameter("id", viejo).getSingleResult()).longValue();
        assertEquals(0, membresiasViejas, "la membresía del usuario borrado se va con él");
    }

    @Test
    @Transactional
    @DisplayName("borrar en auth limpia la ficha en el momento, sin esperar al alta siguiente")
    void elBorradoLimpiaSolo() {
        String email = "borrado-limpio-" + UUID.randomUUID() + "@test.com";
        UUID id = UUID.randomUUID();

        alta(id, email);
        assertTrue(fichasCon(email) == 1);

        em.createNativeQuery("DELETE FROM auth.users WHERE id = :id")
                .setParameter("id", id).executeUpdate();
        em.flush();

        assertEquals(0, fichasCon(email),
                "con el trigger de borrado, la ficha no llega a quedar huérfana");
    }
}
