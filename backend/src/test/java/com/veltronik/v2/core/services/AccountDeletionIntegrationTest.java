package com.veltronik.v2.core.services;

import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El borrado de cuenta, contra Postgres de verdad.
 *
 * <p>Es la operación irreversible del sistema, y lo que hay que probar <b>es la base</b>: que
 * el borrado del gimnasio arrastre en cascada todo lo del cliente, que los ingresos de
 * Veltronik sobrevivan a esa cascada, y que durante la gracia el acceso quede cerrado pero
 * reversible. Nada de eso existe en un mock.</p>
 */
class AccountDeletionIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private AccountDeletionService deletionService;

    // ── Siembra ──

    private UUID crearUsuario(String email) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("INSERT INTO auth.users (id, email) VALUES (:i, :e)")
                .setParameter("i", id).setParameter("e", email).executeUpdate();
        em.flush();
        return id; // el trigger de la V11 crea el app_user
    }

    private UUID crearGimnasioDe(UUID userId, String nombre) {
        UUID tenant = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:i, now(), now(), :n, true)
                """).setParameter("i", tenant).setParameter("n", nombre).executeUpdate();
        em.createNativeQuery("""
                INSERT INTO tenant_membership (id, created_at, updated_at, user_id, tenant_id, role, is_active)
                VALUES (:i, now(), now(), :u, :t, 'OWNER', true)
                """)
                .setParameter("i", UUID.randomUUID()).setParameter("u", userId)
                .setParameter("t", tenant).executeUpdate();
        em.flush();
        return tenant;
    }

    private void crearSocio(UUID tenant, String nombre) {
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, is_active, created_at, updated_at)
                VALUES (:i, :t, :n, 'X', :e, true, now(), now())
                """)
                .setParameter("i", UUID.randomUUID()).setParameter("t", tenant)
                .setParameter("n", nombre).setParameter("e", nombre + UUID.randomUUID() + "@t.com")
                .executeUpdate();
    }

    private void crearCobroDeVeltronik(UUID tenant, String monto) {
        em.createNativeQuery("""
                INSERT INTO tenant_payment (id, created_at, updated_at, tenant_id, mp_payment_id,
                                            amount, status, payment_date)
                VALUES (:i, now(), now(), :t, :mp, :a, 'APPROVED', now())
                """)
                .setParameter("i", UUID.randomUUID()).setParameter("t", tenant)
                .setParameter("mp", "mp-" + UUID.randomUUID())
                .setParameter("a", new java.math.BigDecimal(monto))
                .executeUpdate();
    }

    private long contar(String sql, UUID param) {
        return ((Number) em.createNativeQuery(sql).setParameter("id", param).getSingleResult()).longValue();
    }

    @Nested
    @DisplayName("los 30 días de gracia")
    class Gracia {

        @Test
        @Transactional
        @DisplayName("pedir el borrado cierra los gimnasios pero no borra nada")
        void pedirCierraSinBorrar() {
            UUID user = crearUsuario("gracia-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Gimnasio A");
            crearSocio(gym, "Juan");
            em.flush();

            var estado = deletionService.solicitar(user);
            em.flush();

            assertTrue(estado.pendiente());
            assertNotNull(estado.programado());
            assertEquals(1, estado.gimnasios());

            // Cerrado, pero TODO sigue ahí.
            assertNotNull(em.createNativeQuery("SELECT deletion_scheduled_at FROM tenant WHERE id = :id")
                    .setParameter("id", gym).getSingleResult(), "el gimnasio queda marcado");
            assertEquals(1, contar("SELECT COUNT(*) FROM gym_members WHERE tenant_id = :id", gym),
                    "durante la gracia no se borra un solo dato");
        }

        @Test
        @Transactional
        @DisplayName("arrepentirse devuelve todo a la normalidad")
        void arrepentirseRestaura() {
            UUID user = crearUsuario("vuelta-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Gimnasio B");
            crearSocio(gym, "Ana");
            em.flush();

            deletionService.solicitar(user);
            em.flush();
            var estado = deletionService.cancelar(user);
            em.flush();

            assertTrue(!estado.pendiente());
            assertNull(em.createNativeQuery("SELECT deletion_scheduled_at FROM tenant WHERE id = :id")
                    .setParameter("id", gym).getSingleResult(), "el gimnasio vuelve a estar abierto");
            assertEquals(1, contar("SELECT COUNT(*) FROM gym_members WHERE tenant_id = :id", gym));
        }

        @Test
        @Transactional
        @DisplayName("pedirlo dos veces no reinicia el reloj")
        void noSeReiniciaElReloj() {
            UUID user = crearUsuario("doble-" + UUID.randomUUID() + "@t.com");
            crearGimnasioDe(user, "Gimnasio C");
            em.flush();

            var primera = deletionService.solicitar(user);
            var segunda = deletionService.solicitar(user);

            assertEquals(primera.programado(), segunda.programado(),
                    "si se reiniciara, alguien podría estirar la gracia para siempre sin querer");
        }
    }

    /**
     * Borrar UNA sucursal, dejando la cuenta y las demás en pie.
     *
     * <p>Antes esto era instantáneo y definitivo: un clic se llevaba el gimnasio con sus
     * socios y su historial, sin un minuto de arrepentimiento — mientras que borrar la cuenta
     * ENTERA sí tenía 30 días. La acción más chica estaba menos protegida que la grande.</p>
     */
    @Nested
    @DisplayName("borrar una sola sucursal")
    class UnaSucursal {

        @Test
        @Transactional
        @DisplayName("se programa a 30 días, no se borra en el acto")
        void seProgramaNoSeBorra() {
            UUID user = crearUsuario("sucursal-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Sucursal Centro");
            crearSocio(gym, "Juan");
            em.flush();

            var cuando = deletionService.programarBorradoSucursal(gym);
            em.flush();

            assertNotNull(cuando);
            assertEquals(1, contar("SELECT COUNT(*) FROM tenant WHERE id = :id", gym),
                    "el gimnasio sigue existiendo durante la gracia");
            assertEquals(1, contar("SELECT COUNT(*) FROM gym_members WHERE tenant_id = :id", gym),
                    "y sus socios también");
        }

        @Test
        @Transactional
        @DisplayName("no toca las otras sucursales del mismo dueño")
        void noTocaLasOtras() {
            UUID user = crearUsuario("multi-" + UUID.randomUUID() + "@t.com");
            UUID centro = crearGimnasioDe(user, "Centro");
            UUID norte = crearGimnasioDe(user, "Norte");
            em.flush();

            deletionService.programarBorradoSucursal(centro);
            em.flush();

            assertNull(em.createNativeQuery("SELECT deletion_scheduled_at FROM tenant WHERE id = :id")
                    .setParameter("id", norte).getSingleResult(),
                    "borrar una sucursal no puede arrastrar a las hermanas");
        }

        @Test
        @Transactional
        @DisplayName("la cuenta del dueño NO queda marcada")
        void laCuentaSigueViva() {
            UUID user = crearUsuario("duenio-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Sucursal Sola");
            em.flush();

            deletionService.programarBorradoSucursal(gym);
            em.flush();

            assertNull(em.createNativeQuery("SELECT deletion_scheduled_at FROM app_user WHERE id = :id")
                    .setParameter("id", user).getSingleResult(),
                    "cerrar un local no es irse del sistema");
        }

        @Test
        @Transactional
        @DisplayName("arrepentirse la devuelve a la normalidad")
        void arrepentirse() {
            UUID user = crearUsuario("vuelve-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Sucursal Que Vuelve");
            em.flush();

            deletionService.programarBorradoSucursal(gym);
            em.flush();
            deletionService.cancelarBorradoSucursal(gym);
            em.flush();

            assertNull(em.createNativeQuery("SELECT deletion_scheduled_at FROM tenant WHERE id = :id")
                    .setParameter("id", gym).getSingleResult());
        }

        @Test
        @Transactional
        @DisplayName("vencida la gracia, se borra y los ingresos se archivan")
        void purgaConArchivo() {
            UUID user = crearUsuario("purga-suc-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Sucursal Vencida");
            crearSocio(gym, "Ana");
            crearCobroDeVeltronik(gym, "45000");
            em.flush();

            deletionService.programarBorradoSucursal(gym);
            em.flush();
            deletionService.purgarSucursal(gym);
            em.flush();

            assertEquals(0, contar("SELECT COUNT(*) FROM tenant WHERE id = :id", gym));
            assertEquals(0, contar("SELECT COUNT(*) FROM gym_members WHERE tenant_id = :id", gym));

            long archivados = ((Number) em.createNativeQuery(
                    "SELECT COUNT(*) FROM saas_revenue WHERE amount = 45000").getSingleResult()).longValue();
            assertTrue(archivados >= 1, "los ingresos de Veltronik sobreviven también acá");
        }

        @Test
        @Transactional
        @DisplayName("el dueño sigue existiendo después de purgar su sucursal")
        void elDuenioSobrevive() {
            UUID user = crearUsuario("sobrevive-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Sucursal Cerrada");
            em.flush();

            deletionService.programarBorradoSucursal(gym);
            em.flush();
            deletionService.purgarSucursal(gym);
            em.flush();

            assertEquals(1, contar("SELECT COUNT(*) FROM app_user WHERE id = :id", user),
                    "cerrar un local no puede borrar a la persona");
        }
    }

    @Nested
    @DisplayName("la purga")
    class Purga {

        @Test
        @Transactional
        @DisplayName("borra el gimnasio y TODO lo del cliente")
        void borraTodoLoDelCliente() {
            UUID user = crearUsuario("purga-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Gimnasio D");
            crearSocio(gym, "Pedro");
            crearSocio(gym, "Marta");
            em.flush();

            deletionService.solicitar(user);
            em.flush();
            deletionService.purgarCuenta(user);
            em.flush();

            assertEquals(0, contar("SELECT COUNT(*) FROM tenant WHERE id = :id", gym),
                    "el gimnasio se borra");
            assertEquals(0, contar("SELECT COUNT(*) FROM gym_members WHERE tenant_id = :id", gym),
                    "y arrastra a sus socios en cascada");
            assertEquals(0, contar("SELECT COUNT(*) FROM tenant_membership WHERE user_id = :id", user),
                    "y las membresías");
        }

        /**
         * La regla que el dueño eligió: lo del cliente se borra, lo de Veltronik se conserva
         * sin datos del gimnasio. Sin esto no hay forma de cuadrar con Mercado Pago.
         */
        @Test
        @Transactional
        @DisplayName("los ingresos de Veltronik sobreviven, sin nombre del gimnasio")
        void losIngresosSobreviven() {
            UUID user = crearUsuario("plata-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Gimnasio Que Pagaba");
            crearCobroDeVeltronik(gym, "45000");
            crearCobroDeVeltronik(gym, "45000");
            em.flush();

            deletionService.solicitar(user);
            em.flush();
            deletionService.purgarCuenta(user);
            em.flush();

            assertEquals(0, contar("SELECT COUNT(*) FROM tenant_payment WHERE tenant_id = :id", gym),
                    "el registro del cliente se va con él");

            long archivados = ((Number) em.createNativeQuery(
                    "SELECT COUNT(*) FROM saas_revenue WHERE amount = 45000").getSingleResult()).longValue();
            assertTrue(archivados >= 2, "los ingresos de Veltronik tienen que quedar");

            long conNombre = ((Number) em.createNativeQuery(
                    "SELECT COUNT(*) FROM saas_revenue WHERE cliente_ref LIKE '%Que Pagaba%'")
                    .getSingleResult()).longValue();
            assertEquals(0, conNombre, "pero sin nada que identifique al gimnasio");
        }

        @Test
        @Transactional
        @DisplayName("solo purga a quien ya se le venció la gracia")
        void noPurgaAntesDeTiempo() {
            UUID user = crearUsuario("temprano-" + UUID.randomUUID() + "@t.com");
            UUID gym = crearGimnasioDe(user, "Gimnasio E");
            em.flush();

            deletionService.solicitar(user); // vence en 30 días
            em.flush();
            deletionService.purgarVencidas();
            em.flush();

            assertEquals(1, contar("SELECT COUNT(*) FROM tenant WHERE id = :id", gym),
                    "faltan 30 días: no se toca");
        }
    }
}
