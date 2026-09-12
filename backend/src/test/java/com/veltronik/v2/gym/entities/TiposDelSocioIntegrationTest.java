package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Las dos columnas del socio que dejaron de ser texto, probadas contra PostgreSQL de verdad.
 *
 * <p><b>Por qué existe.</b> La V78 pasó {@code birth_date} de {@code text} a {@code date} y la
 * V79 pasó {@code attendance_days} de {@code text} a {@code jsonb}. Los dos son cambios de TIPO
 * sobre columnas que viajan al cliente instalado, y en los dos hay una forma silenciosa de
 * arruinarlos que ningún test de unidad ve:</p>
 *
 * <ul>
 *   <li><b>jsonb.</b> Hibernate puede escribir un String o bien COMO json, o bien como un
 *       string DENTRO de un json — o sea guardar {@code "\"[1,3]\""} en vez de {@code [1,3]}.
 *       Las dos cosas "andan" y guardan sin error; la segunda le devuelve al mostrador una
 *       basura que no puede parsear. La diferencia solo se ve yendo y volviendo contra una
 *       base real.</li>
 *   <li><b>date.</b> Lo que importa es que el valor sobreviva el viaje sin correrse de día,
 *       y que la consulta de cumpleaños —que ahora usa {@code to_char(birth_date, 'MM-DD')}
 *       en vez de recortar el string— siga encontrando a quien corresponde.</li>
 * </ul>
 */
@Transactional
@DisplayName("Los tipos del socio, contra PostgreSQL")
class TiposDelSocioIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymMemberRepository repository;

    private UUID gym;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio de los tipos', true)
                """).setParameter("id", gym).executeUpdate();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /**
     * Sin {@code setId}: el id lo pone {@code AssignableUuidGenerator} al persistir. Con un
     * id asignado a mano, Hibernate considera la entidad DETACHED y {@code persist} falla.
     */
    private GymMember nuevoSocio(String nombre) {
        GymMember m = new GymMember();
        m.setTenant(em.getReference(com.veltronik.v2.core.entities.Tenant.class, gym));
        m.setFirstName(nombre);
        m.setLastName("Probado");
        m.setEmail(nombre.toLowerCase() + "@test.local");
        m.setActive(true);
        m.setMembershipEnd(LocalDateTime.now().plusDays(30));
        return m;
    }

    @Test
    @DisplayName("los días de asistencia vuelven como se guardaron, no envueltos en un string")
    void elJsonNoSeEnvuelveEnUnString() {
        GymMember m = nuevoSocio("Dias");
        m.setAttendanceDays("[1, 3, 5]");
        em.persist(m);
        em.flush();
        em.clear();

        GymMember leido = em.find(GymMember.class, m.getId());
        assertNotNull(leido.getAttendanceDays());

        // Lo que NO tiene que pasar: que vuelva con comillas escapadas alrededor.
        assertTrue(leido.getAttendanceDays().trim().startsWith("["),
                "attendance_days volvió envuelto en un string JSON en vez de como array: "
                + leido.getAttendanceDays() + ". Revisar @JdbcTypeCode(SqlTypes.JSON) en GymMember.");

        // Y que Postgres lo reconozca como un array de verdad, no como un texto cualquiera.
        Object tipo = em.createNativeQuery(
                        "SELECT jsonb_typeof(attendance_days) FROM gym_member WHERE id = :id")
                .setParameter("id", m.getId())
                .getSingleResult();
        assertEquals("array", tipo,
                "Postgres no ve un array JSON en attendance_days, así que el CHECK de la V79 "
                + "y la consulta `attendance_days @> '[2]'` no sirven de nada.");
    }

    @Test
    @DisplayName("un socio sin días de asistencia guarda NULL y no rompe")
    void elJsonAceptaNulo() {
        GymMember m = nuevoSocio("SinDias");
        m.setAttendanceDays(null);
        em.persist(m);
        em.flush();
        em.clear();

        assertEquals(null, em.find(GymMember.class, m.getId()).getAttendanceDays());
    }

    @Test
    @DisplayName("la fecha de nacimiento sobrevive el viaje sin correrse de día")
    void laFechaNoSeCorre() {
        LocalDate nacimiento = LocalDate.of(1990, 5, 12);
        GymMember m = nuevoSocio("Fecha");
        m.setBirthDate(nacimiento);
        em.persist(m);
        em.flush();
        em.clear();

        assertEquals(nacimiento, em.find(GymMember.class, m.getId()).getBirthDate());
    }

    /**
     * La razón de ser de la V78: con la columna en texto, esta consulta recortaba el string
     * por posición y un valor con otro formato no cumplía años nunca.
     */
    @Test
    @DisplayName("la consulta de cumpleaños encuentra al que cumple hoy")
    void losCumpleanosSeEncuentran() {
        LocalDate hoy = LocalDate.now();

        GymMember cumple = nuevoSocio("Cumple");
        cumple.setBirthDate(hoy.minusYears(30));
        em.persist(cumple);

        GymMember noCumple = nuevoSocio("NoCumple");
        noCumple.setBirthDate(hoy.minusYears(30).plusDays(1));
        em.persist(noCumple);

        em.flush();
        em.clear();

        String mesYDia = String.format("%02d-%02d", hoy.getMonthValue(), hoy.getDayOfMonth());
        List<GymMember> encontrados = repository.cumplenHoy(gym, mesYDia);

        assertEquals(1, encontrados.size(),
                "La consulta de cumpleaños tendría que encontrar exactamente al que cumple hoy.");
        assertEquals(cumple.getId(), encontrados.get(0).getId());
    }
}
