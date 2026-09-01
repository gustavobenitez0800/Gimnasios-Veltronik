package com.veltronik.v2.gym.services;

import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El flujo REAL del check-in, de punta a punta y contra Postgres.
 *
 * <p><b>Por qué existe:</b> el check-in falló en producción dos veces seguidas y las dos las
 * encontró el dueño con el teléfono en la mano, no yo. La segunda —"no te encontramos" con el
 * DNI bien puesto— no la pude reproducir razonando sobre el código, porque el problema podía
 * estar en cualquiera de tres capas: la proyección del token, el aislamiento por gimnasio o la
 * comparación del documento. Un test de unidad con mocks no toca ninguna de las tres: las tres
 * SON la base de datos.</p>
 *
 * <p>Este test siembra un gimnasio, un socio y un cartel de verdad, y llama al servicio como lo
 * llama el teléfono del socio.</p>
 */
class CheckinFlowIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private CheckinService checkinService;

    @Autowired
    private AccessLogService accessLogService;

    private UUID crearGimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :nombre, true)
                """).setParameter("id", id).setParameter("nombre", nombre).executeUpdate();
        return id;
    }

    private UUID crearSocio(UUID tenant, String nombre, String documento, LocalDateTime vence) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :tenant, :nombre, 'Prueba', :email, :doc, true, :vence, now(), now())
                """)
                .setParameter("id", id)
                .setParameter("tenant", tenant)
                .setParameter("nombre", nombre)
                .setParameter("email", nombre.toLowerCase() + "-" + id + "@test.com")
                .setParameter("doc", documento)
                .setParameter("vence", vence)
                .executeUpdate();
        return id;
    }

    private String crearCartel(UUID tenant) {
        String token = "tok-" + UUID.randomUUID().toString().replace("-", "");
        em.createNativeQuery("""
                INSERT INTO checkin_point (id, created_at, updated_at, tenant_id, token, name, active)
                VALUES (:id, now(), now(), :tenant, :token, 'Puerta principal', true)
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("tenant", tenant)
                .setParameter("token", token)
                .executeUpdate();
        return token;
    }

    @Test
    @Transactional
    @DisplayName("el caso feliz: socio al día escanea y se registra su entrada")
    void socioAlDiaEntra() {
        UUID gym = crearGimnasio("Gimnasio Centro");
        crearSocio(gym, "Juan", "30111222", LocalDateTime.now().plusDays(20));
        String token = crearCartel(gym);
        em.flush();

        var r = checkinService.scan(token, "30111222", null);

        assertTrue(r.ok(), "debería encontrar al socio: " + r.titulo() + " — " + r.detalle());
        assertEquals("Juan", r.socio(), "solo el nombre de pila viaja al telefono");
        assertEquals("Gimnasio Centro", r.gimnasio());
        assertEquals("ENTRADA", r.direccion());
        assertEquals("AL_DIA", r.estado());
        assertNotNull(r.titulo());
    }

    @Test
    @Transactional
    @DisplayName("el formato del documento no importa: con puntos en la ficha, sin puntos al escribir")
    void elFormatoNoImporta() {
        UUID gym = crearGimnasio("Gimnasio Formato");
        crearSocio(gym, "Ana", "30.111.222", LocalDateTime.now().plusDays(10));
        String token = crearCartel(gym);
        em.flush();

        var r = checkinService.scan(token, "30111222", null);

        assertTrue(r.ok(), "los puntos son adorno: " + r.titulo() + " — " + r.detalle());
        assertEquals("Ana", r.socio());
    }

    @Test
    @Transactional
    @DisplayName("el socio vencido entra igual, pero suena y avisa al mostrador")
    void socioVencidoEntraConAviso() {
        UUID gym = crearGimnasio("Gimnasio Vencidos");
        crearSocio(gym, "Pedro", "27999888", LocalDateTime.now().minusDays(40));
        String token = crearCartel(gym);
        em.flush();

        var r = checkinService.scan(token, "27999888", null);

        assertTrue(r.ok());
        assertEquals("VENCIDO", r.estado());
        assertEquals("ENTRADA", r.direccion(), "la decisión del dueño es que entre igual");
        assertTrue(r.sonar(), "tiene que sonar en su teléfono");
        assertTrue(r.avisarMostrador(), "y el mostrador tiene que enterarse");
    }

    /**
     * El aislamiento entre sucursales, que es la regla más cara de romper del sistema: el cartel
     * de una sucursal NO puede marcarle la entrada al socio de otra.
     */
    @Test
    @Transactional
    @DisplayName("el cartel de una sucursal no encuentra al socio de otra")
    void elCartelNoCruzaSucursales() {
        UUID centro = crearGimnasio("Sucursal Centro");
        UUID norte = crearGimnasio("Sucursal Norte");
        crearSocio(norte, "Marta", "33444555", LocalDateTime.now().plusDays(30));
        String tokenDelCentro = crearCartel(centro);
        em.flush();

        var r = checkinService.scan(tokenDelCentro, "33444555", null);

        assertTrue(!r.ok(), "Marta es socia de Norte: el cartel de Centro no puede reconocerla");
    }

    /**
     * Lo que ve un curioso que escribe documentos ajenos. El cartel cuelga de una pared: hay
     * que asumir que alguien va a probar.
     */
    @Test
    @Transactional
    @DisplayName("al teléfono solo le llega el nombre de pila, nunca el apellido")
    void noSeFiltraElApellido() {
        UUID gym = crearGimnasio("Gimnasio Privacidad");
        crearSocio(gym, "Sofia", "31222333", LocalDateTime.now().plusDays(15));
        String token = crearCartel(gym);
        em.flush();

        var r = checkinService.scan(token, "31222333", null);

        assertEquals("Sofia", r.socio(),
                "devolver el apellido convertiría el cartel en una consulta de padrón");
    }

    @Test
    @Transactional
    @DisplayName("cuando no encuentra al socio, dice EN QUÉ sucursal buscó")
    void elErrorNombraLaSucursal() {
        UUID centro = crearGimnasio("Sucursal Centro");
        crearCartel(centro);
        String token = crearCartel(centro);
        em.flush();

        var r = checkinService.scan(token, "99999999", null);

        assertTrue(!r.ok());
        assertEquals("Sucursal Centro", r.gimnasio(),
                "con varias sedes, 'no te encontramos' a secas es indescifrable");
    }

    @Test
    @Transactional
    @DisplayName("un teléfono que marca por muchos socios distintos levanta la mano")
    void telefonoCompartidoAvisaAlMostrador() {
        UUID gym = crearGimnasio("Gimnasio Compartido");
        String token = crearCartel(gym);
        UUID telefono = UUID.randomUUID();

        // Tres personas distintas marcando desde el mismo aparato. Dos sería una pareja; tres
        // ya no parece un hogar.
        String[] docs = {"40111111", "40222222", "40333333"};
        for (String d : docs) {
            crearSocio(gym, "Socio" + d.charAt(2), d, LocalDateTime.now().plusDays(30));
        }
        em.flush();

        boolean avisoEnElUltimo = false;
        for (String d : docs) {
            var r = checkinService.scan(token, d, telefono);
            assertTrue(r.ok());
            avisoEnElUltimo = r.avisarMostrador();
        }

        assertTrue(avisoEnElUltimo,
                "el sistema no acusa a nadie, pero tiene que levantar la mano para que lo mire una persona");
    }

    @Test
    @Transactional
    @DisplayName("un teléfono normal, con un solo socio, no molesta a nadie")
    void telefonoNormalNoAvisa() {
        UUID gym = crearGimnasio("Gimnasio Normal");
        crearSocio(gym, "Clara", "41555666", LocalDateTime.now().plusDays(30));
        String token = crearCartel(gym);
        em.flush();

        var r = checkinService.scan(token, "41555666", UUID.randomUUID());

        assertTrue(r.ok());
        assertTrue(!r.avisarMostrador(), "un socio al día con su propio teléfono no es un evento");
    }

    /**
     * El aviso al mostrador: la otra punta del check-in. Sin esto, el socio vencido que
     * escanea el cartel entra, entrena y se va — el aviso salió en SU teléfono y ahí murió.
     */
    @Test
    @Transactional
    @DisplayName("el socio vencido que entró por QR aparece en los avisos del mostrador")
    void elVencidoApareceEnElMostrador() {
        UUID gym = crearGimnasio("Gimnasio Avisos");
        crearSocio(gym, "Roberto", "29888777", LocalDateTime.now().minusDays(20));
        String token = crearCartel(gym);
        em.flush();

        checkinService.scan(token, "29888777", null);
        em.flush();

        com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
        try {
            var avisos = accessLogService.avisosPendientes();
            assertEquals(1, avisos.size());
            assertEquals("Roberto Prueba", avisos.get(0).nombre());
            assertEquals("VENCIDO", avisos.get(0).estado());
        } finally {
            com.veltronik.v2.core.security.TenantContextHolder.clear();
        }
    }

    @Test
    @Transactional
    @DisplayName("el socio al día NO molesta al mostrador")
    void elAlDiaNoAparece() {
        UUID gym = crearGimnasio("Gimnasio Tranquilo");
        crearSocio(gym, "Elena", "32111000", LocalDateTime.now().plusDays(20));
        String token = crearCartel(gym);
        em.flush();

        checkinService.scan(token, "32111000", null);
        em.flush();

        com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
        try {
            assertTrue(accessLogService.avisosPendientes().isEmpty(),
                    "si avisara por cada socio al día, la lista sería ruido y se dejaría de mirar");
        } finally {
            com.veltronik.v2.core.security.TenantContextHolder.clear();
        }
    }

    /**
     * El veredicto se recalcula al consultar, no se congela al escanear. Si entró vencido a
     * las 9 y pagó a las 10, a las 11 ya no hay nada que reclamarle — y un aviso congelado
     * mandaría a la recepcionista a pedirle plata a alguien que está al día.
     */
    @Test
    @Transactional
    @DisplayName("si el socio paga después de entrar, el aviso desaparece solo")
    void alPagarDesapareceElAviso() {
        UUID gym = crearGimnasio("Gimnasio Que Cobra");
        UUID socio = crearSocio(gym, "Marcos", "30555444", LocalDateTime.now().minusDays(5));
        String token = crearCartel(gym);
        em.flush();

        checkinService.scan(token, "30555444", null);
        em.flush();

        com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
        try {
            assertEquals(1, accessLogService.avisosPendientes().size(), "entró vencido");

            // Paga en el mostrador: se le corre el vencimiento.
            em.createNativeQuery("UPDATE gym_members SET membership_end = :f WHERE id = :id")
                    .setParameter("f", LocalDateTime.now().plusDays(30))
                    .setParameter("id", socio).executeUpdate();
            em.flush();
            em.clear();

            assertTrue(accessLogService.avisosPendientes().isEmpty(),
                    "el aviso tiene que decir la verdad de AHORA, no la de cuando entró");
        } finally {
            com.veltronik.v2.core.security.TenantContextHolder.clear();
        }
    }

    /**
     * El QR y el mostrador escriben en el MISMO lugar, y tienen que entenderse en los dos
     * sentidos. Estos casos son los que rompían en la práctica.
     */
    @Nested
    @DisplayName("el QR y el mostrador, conectados")
    class QrYMostrador {

        @Test
        @Transactional
        @DisplayName("entra por QR y el mostrador ve su visita abierta")
        void entraPorQrYElMostradorLoVe() {
            UUID gym = crearGimnasio("Gimnasio Mixto A");
            crearSocio(gym, "Diego", "26111000", LocalDateTime.now().plusDays(10));
            String token = crearCartel(gym);
            em.flush();

            checkinService.scan(token, "26111000", null);
            em.flush();

            com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
            try {
                assertEquals(1, accessLogService.getActiveAccesses().size(),
                        "lo que marca el socio con su teléfono tiene que verlo el mostrador");
            } finally {
                com.veltronik.v2.core.security.TenantContextHolder.clear();
            }
        }

        /**
         * El caso que reportó el dueño: el mostrador marca la salida a mano, y después el
         * socio escanea el QR al irse. Antes su teléfono decía "marcar salida" y el servidor
         * le abría una ENTRADA — quedaba "adentro del gimnasio" después de haberse ido.
         *
         * <p>El dato del servidor SIEMPRE fue correcto; lo que mentía era la etiqueta del
         * botón. Este test fija que el servidor efectivamente hace lo suyo bien.</p>
         */
        @Test
        @Transactional
        @DisplayName("si el mostrador ya marcó la salida, el QR abre una visita nueva (y no rompe)")
        void elMostradorMarcaSalidaYDespuesEscanea() {
            UUID gym = crearGimnasio("Gimnasio Mixto B");
            UUID socio = crearSocio(gym, "Laura", "27222111", LocalDateTime.now().plusDays(10));
            String token = crearCartel(gym);
            em.flush();

            com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
            try {
                // Entra por QR…
                checkinService.scan(token, "27222111", null);
                em.flush();
                // …y el mostrador le marca la salida a mano.
                var salida = accessLogService.registerScan(socio, "manual", null, null, null, null);
                em.flush();
                assertEquals(AccessLogService.Direction.SALIDA, salida.direction(),
                        "el mostrador tiene que poder cerrar una visita que abrió el QR");
                assertEquals(0, accessLogService.getActiveAccesses().size());
            } finally {
                com.veltronik.v2.core.security.TenantContextHolder.clear();
            }
        }

        /**
         * El espejo: el mostrador marca la ENTRADA (el socio se olvidó el teléfono) y el socio
         * escanea al salir. Tiene que cerrar esa visita, no abrir otra.
         */
        @Test
        @Transactional
        @DisplayName("el mostrador marca la entrada y el socio cierra con el QR")
        void elMostradorEntraYElQrSale() {
            UUID gym = crearGimnasio("Gimnasio Mixto C");
            UUID socio = crearSocio(gym, "Nico", "28333222", LocalDateTime.now().plusDays(10));
            String token = crearCartel(gym);
            em.flush();

            com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
            try {
                accessLogService.registerScan(socio, "manual", null, null, null, null);
                em.flush();
            } finally {
                com.veltronik.v2.core.security.TenantContextHolder.clear();
            }

            // Pasa el tiempo suficiente para que no sea un rebote, y el socio escanea al irse.
            em.createNativeQuery("UPDATE access_log SET check_in_at = :t WHERE member_id = :m")
                    .setParameter("t", LocalDateTime.now().minusHours(1))
                    .setParameter("m", socio).executeUpdate();
            em.flush();
            em.clear();

            var r = checkinService.scan(token, "28333222", null);

            assertEquals("SALIDA", r.direccion(),
                    "el QR tiene que cerrar la visita que abrió el mostrador, no abrir otra");
        }
    }

    /**
     * La consulta que reemplazó a la memoria del teléfono. Antes el celular guardaba la última
     * dirección y esa copia se volvía mentira apenas el mostrador tocaba algo: ofrecía "marcar
     * salida", el servidor no encontraba visita abierta, y abría una ENTRADA — el socio
     * quedaba adentro del gimnasio después de haberse ido.
     */
    @Nested
    @DisplayName("el teléfono pregunta en vez de acordarse")
    class EstadoDelSocio {

        @Test
        @Transactional
        @DisplayName("recién entrado, está adentro")
        void reciénEntradoEstaAdentro() {
            UUID gym = crearGimnasio("Gimnasio Estado A");
            crearSocio(gym, "Bruno", "24111222", LocalDateTime.now().plusDays(10));
            String token = crearCartel(gym);
            em.flush();

            checkinService.scan(token, "24111222", null);
            em.flush();

            assertTrue(checkinService.estado(token, "24111222").adentro());
        }

        /** El caso del dueño: el mostrador cierra la visita y el teléfono tiene que enterarse. */
        @Test
        @Transactional
        @DisplayName("si el mostrador marca la salida, el teléfono se entera")
        void elMostradorCierraYElTelefonoSeEntera() {
            UUID gym = crearGimnasio("Gimnasio Estado B");
            UUID socio = crearSocio(gym, "Carla", "25333444", LocalDateTime.now().plusDays(10));
            String token = crearCartel(gym);
            em.flush();

            checkinService.scan(token, "25333444", null);
            em.flush();
            assertTrue(checkinService.estado(token, "25333444").adentro());

            com.veltronik.v2.core.security.TenantContextHolder.setTenantId(gym);
            try {
                accessLogService.registerScan(socio, "manual", null, null, null, null);
                em.flush();
            } finally {
                com.veltronik.v2.core.security.TenantContextHolder.clear();
            }

            assertTrue(!checkinService.estado(token, "25333444").adentro(),
                    "sin esto el teléfono ofrecía marcar una salida que ya no existía, "
                    + "y terminaba abriendo una entrada fantasma");
        }

        /**
         * Lo que ve un curioso. El cartel cuelga de una pared: hay que asumir que alguien va a
         * probar documentos ajenos para ver quién es socio.
         */
        @Test
        @Transactional
        @DisplayName("no revela nada: lo mismo para un documento que no existe que para uno afuera")
        void noRevelaNada() {
            UUID gym = crearGimnasio("Gimnasio Estado C");
            crearSocio(gym, "Elsa", "26555666", LocalDateTime.now().plusDays(10));
            String token = crearCartel(gym);
            em.flush();

            var socioAfuera = checkinService.estado(token, "26555666");
            var inexistente = checkinService.estado(token, "99999999");

            assertEquals(socioAfuera.adentro(), inexistente.adentro());
            assertEquals(socioAfuera.desde(), inexistente.desde());
        }

        @Test
        @Transactional
        @DisplayName("un cartel de otra sucursal no dice nada del socio")
        void noCruzaSucursales() {
            UUID centro = crearGimnasio("Estado Centro");
            UUID norte = crearGimnasio("Estado Norte");
            crearSocio(norte, "Hugo", "27777888", LocalDateTime.now().plusDays(10));
            String tokenCentro = crearCartel(centro);
            em.flush();

            assertTrue(!checkinService.estado(tokenCentro, "27777888").adentro());
        }
    }

    @Test
    @Transactional
    @DisplayName("un cartel apagado deja de funcionar")
    void cartelRotadoNoSirve() {
        UUID gym = crearGimnasio("Gimnasio Rotado");
        crearSocio(gym, "Luis", "28777666", LocalDateTime.now().plusDays(5));
        String token = crearCartel(gym);
        em.createNativeQuery("UPDATE checkin_point SET active = false WHERE token = :t")
                .setParameter("t", token).executeUpdate();
        em.flush();

        var r = checkinService.scan(token, "28777666", null);

        assertTrue(!r.ok(), "rotar el cartel tiene que matar al viejo en el momento");
    }
}
