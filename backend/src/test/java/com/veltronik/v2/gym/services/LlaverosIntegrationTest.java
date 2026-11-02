package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.controllers.LlaveroController;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.MemberCredential;
import com.veltronik.v2.gym.repositories.MemberCredentialRepository;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Los llaveros de los socios contra Postgres de verdad (V90, ADR-016).
 *
 * <p>Lo que más importa probar acá no es el camino feliz sino las dos reglas que, rotas, dejan
 * entrar a la persona equivocada: <b>un llavero activo es de un solo socio</b> (lo garantiza el
 * índice de la base, no el código) y <b>el código se compara exacto</b> (con los ceros de
 * adelante: {@code 0012345678} no es el DNI {@code 12345678}).</p>
 */
@Transactional
@DisplayName("Los llaveros de los socios")
class LlaverosIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private EntityManager em;
    @Autowired private LlaveroService service;
    @Autowired private GymMemberService memberService;
    @Autowired private MemberCredentialRepository repository;
    @Autowired private LlaveroController controller;

    private UUID gym;
    private UUID ana;
    private UUID beto;

    @BeforeEach
    void sembrar() {
        gym = crearGimnasio("Gimnasio con molinete");
        TenantContextHolder.setTenantId(gym);
        ana = crearSocio(gym, "Ana", "Pérez", "30111222");
        beto = crearSocio(gym, "Beto", "Gómez", "28999111");
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

    private UUID crearSocio(UUID tenant, String nombre, String apellido, String documento) {
        GymMember m = new GymMember();
        m.setTenant(em.getReference(com.veltronik.v2.core.entities.Tenant.class, tenant));
        m.setFirstName(nombre);
        m.setLastName(apellido);
        m.setEmail(UUID.randomUUID() + "@test.local");
        m.setDocument(documento);
        m.setActive(true);
        m.setMembershipEnd(LocalDateTime.now().plusDays(30));
        em.persist(m);
        em.flush();
        return m.getId();
    }

    private void aLaPapelera(UUID socio) {
        em.createNativeQuery("UPDATE gym_member SET deleted_at = now() WHERE id = :id")
                .setParameter("id", socio).executeUpdate();
        em.clear();
    }

    @Nested
    @DisplayName("asignar")
    class Asignar {

        @Test
        @DisplayName("⭐ el llavero queda en la ficha del socio, con quién lo asignó")
        void quedaEnLaFicha() {
            LlaveroService.Asignacion a = service.asignar(ana, "0012345678", false, "Laura (mostrador)");

            assertTrue(a.nuevo());
            List<MemberCredential> ficha = service.delSocio(ana);
            assertEquals(1, ficha.size());
            assertEquals("0012345678", ficha.get(0).getCodigo());
            assertEquals("Laura (mostrador)", ficha.get(0).getAsignadoPorNombre());
            assertTrue(ficha.get(0).estaActivo());
        }

        @Test
        @DisplayName("⭐ se guarda como lo escribe el lector: sin espacios, en mayúsculas y CON los ceros")
        void seGuardaNormalizadoYConLosCeros() {
            service.asignar(ana, "  00bc 5678\n", false, null);

            assertEquals("00BC5678", service.delSocio(ana).get(0).getCodigo());
        }

        @Test
        @DisplayName("pasarlo dos veces no lo duplica: el lector a veces lee dos veces")
        void dosVecesNoDuplica() {
            service.asignar(ana, "0012345678", false, null);
            LlaveroService.Asignacion otraVez = service.asignar(ana, "0012345678", false, null);

            assertFalse(otraVez.nuevo());
            assertEquals(1, service.delSocio(ana).size());
        }

        @Test
        @DisplayName("un socio puede tener más de un llavero")
        void masDeUno() {
            service.asignar(ana, "0012345678", false, null);
            service.asignar(ana, "0087654321", false, null);

            assertEquals(List.of("0012345678", "0087654321"), service.activosPorSocio().get(ana));
        }

        @Test
        @DisplayName("algo que no puede ser un llavero se frena con un mensaje que dice qué hacer")
        void codigoInvalido() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> service.asignar(ana, "12", false, null));
            assertTrue(e.getMessage().contains("lector"), e.getMessage());
            assertThrows(BusinessException.class, () -> service.asignar(ana, "0012ñ45678", false, null));
            assertThrows(BusinessException.class, () -> service.asignar(ana, null, false, null));
        }

        @Test
        @DisplayName("no se le puede asignar a un socio de otro gimnasio")
        void otroGimnasio() {
            UUID otro = crearGimnasio("Otro gimnasio");
            UUID ajeno = crearSocio(otro, "Ajeno", "Socio", "33444555");

            // 404 y no 403: con el filtro del tenant prendido, el socio de otro gimnasio no existe
            // para este, y ni siquiera se confirma que el id sea de alguien.
            ResponseStatusException e = assertThrows(ResponseStatusException.class,
                    () -> service.asignar(ajeno, "0012345678", false, null));
            assertEquals(404, e.getStatusCode().value());
            assertTrue(repository.findAll().stream().noneMatch(c -> c.getMemberId().equals(ajeno)));
        }
    }

    @Nested
    @DisplayName("un llavero, un socio")
    class UnoSolo {

        @Test
        @DisplayName("⭐ si ya es de otro socio, frena y dice de quién es")
        void deOtroSocioFrena() {
            service.asignar(ana, "0012345678", false, null);

            LlaveroService.LlaveroDeOtroSocio e = assertThrows(LlaveroService.LlaveroDeOtroSocio.class,
                    () -> service.asignar(beto, "0012345678", false, null));
            assertEquals(ana, e.getSocioId());
            assertEquals("Ana Pérez", e.getNombre());
            assertTrue(service.delSocio(beto).isEmpty(), "se lo asignó igual a Beto");
        }

        @Test
        @DisplayName("el 409 lleva el socio, para que la pantalla pregunte «¿Pasárselo a…?»")
        void elConflictoLlevaElSocio() {
            service.asignar(ana, "0012345678", false, null);
            LlaveroService.LlaveroDeOtroSocio e = assertThrows(LlaveroService.LlaveroDeOtroSocio.class,
                    () -> service.asignar(beto, "0012345678", false, null));

            var respuesta = controller.deOtroSocio(e);

            assertEquals(409, respuesta.getStatusCode().value());
            Map<String, Object> body = respuesta.getBody();
            assertNotNull(body);
            assertEquals("LLAVERO_DE_OTRO_SOCIO", body.get("codigo"));
            assertEquals(Map.of("id", ana, "nombre", "Ana Pérez"), body.get("socio"));
            assertTrue(String.valueOf(body.get("message")).contains("Ana Pérez"));
        }

        @Test
        @DisplayName("⭐ pasárselo a otro le da de baja el del primero, con el motivo, y no lo borra")
        void reasignarDejaElRastro() {
            service.asignar(ana, "0012345678", false, null);

            LlaveroService.Asignacion a = service.asignar(beto, "0012345678", true, "Laura");

            assertEquals("Ana Pérez", a.reasignadoDe());
            assertEquals(List.of("0012345678"), service.activosPorSocio().get(beto));
            assertNull(service.activosPorSocio().get(ana));
            MemberCredential elDeAna = service.delSocio(ana).get(0);
            assertFalse(elDeAna.estaActivo());
            assertEquals("Se lo pasaron a Beto Gómez", elDeAna.getMotivoBaja());
            assertEquals("Laura", elDeAna.getDadoDeBajaPorNombre());
        }

        @Test
        @DisplayName("si el dueño está en la papelera, se le saca sin preguntar")
        void elDuenoEnLaPapelera() {
            service.asignar(ana, "0012345678", false, null);
            aLaPapelera(ana);

            LlaveroService.Asignacion a = service.asignar(beto, "0012345678", false, null);

            assertTrue(a.nuevo());
            MemberCredential elDeAna = repository.findAll().stream()
                    .filter(c -> c.getMemberId().equals(ana)).findFirst().orElseThrow();
            assertEquals("Su socio estaba en la papelera", elDeAna.getMotivoBaja());
        }

        @Test
        @DisplayName("🔴 la base no deja dos llaveros activos con el mismo código, aunque el código se equivoque")
        void laBaseLoGarantiza() {
            service.asignar(ana, "0012345678", false, null);

            assertThrows(jakarta.persistence.PersistenceException.class, () -> em.createNativeQuery("""
                    INSERT INTO member_credential (id, tenant_id, member_id, created_at, updated_at, codigo)
                    VALUES (:id, :gym, :beto, now(), now(), '0012345678')
                    """)
                    .setParameter("id", UUID.randomUUID()).setParameter("gym", gym).setParameter("beto", beto)
                    .executeUpdate());
        }

        @Test
        @DisplayName("🔴 y la base no acepta un código sin normalizar")
        void laBaseExigeElCodigoNormalizado() {
            assertThrows(jakarta.persistence.PersistenceException.class, () -> em.createNativeQuery("""
                    INSERT INTO member_credential (id, tenant_id, member_id, created_at, updated_at, codigo)
                    VALUES (:id, :gym, :ana, now(), now(), '00bc 5678')
                    """)
                    .setParameter("id", UUID.randomUUID()).setParameter("gym", gym).setParameter("ana", ana)
                    .executeUpdate());
        }

        @Test
        @DisplayName("el mismo número puede ser de un socio en cada sucursal")
        void cadaSucursalElSuyo() {
            UUID otro = crearGimnasio("Otra sucursal");
            UUID ajeno = crearSocio(otro, "Ajeno", "Socio", "33444555");
            service.asignar(ana, "0012345678", false, null);

            TenantContextHolder.setTenantId(otro);
            service.asignar(ajeno, "0012345678", false, null);
            assertEquals(Map.of(ajeno, List.of("0012345678")), service.activosPorSocio());

            TenantContextHolder.setTenantId(gym);
            assertEquals(Map.of(ana, List.of("0012345678")), service.activosPorSocio());
        }
    }

    @Nested
    @DisplayName("dar de baja")
    class DarDeBaja {

        @Test
        @DisplayName("⭐ lo perdió: queda en la ficha con fecha y motivo, deja de viajar al mostrador, y se puede volver a asignar")
        void loPerdio() {
            MemberCredential c = service.asignar(ana, "0012345678", false, null).llavero();

            service.darDeBaja(c.getId(), "Lo perdió", "Laura");

            MemberCredential enLaFicha = service.delSocio(ana).get(0);
            assertFalse(enLaFicha.estaActivo());
            assertNotNull(enLaFicha.getDadoDeBajaAt());
            assertEquals("Lo perdió", enLaFicha.getMotivoBaja());
            assertTrue(service.activosPorSocio().isEmpty());

            // Apareció el llavero: el índice ya no lo cuenta, así que se puede volver a usar.
            assertTrue(service.asignar(beto, "0012345678", false, null).nuevo());
        }

        @Test
        @DisplayName("sin motivo, dice «Dado de baja»; dos veces no cambia nada")
        void sinMotivoYDosVeces() {
            MemberCredential c = service.asignar(ana, "0012345678", false, null).llavero();

            MemberCredential primera = service.darDeBaja(c.getId(), "  ", null);
            LocalDateTime cuando = primera.getDadoDeBajaAt();
            MemberCredential segunda = service.darDeBaja(c.getId(), "Otro motivo", null);

            assertEquals(LlaveroService.MOTIVO_POR_DEFECTO, segunda.getMotivoBaja());
            assertEquals(cuando, segunda.getDadoDeBajaAt());
        }

        @Test
        @DisplayName("un llavero de otro gimnasio no existe para este")
        void otroGimnasio() {
            MemberCredential c = service.asignar(ana, "0012345678", false, null).llavero();
            TenantContextHolder.setTenantId(crearGimnasio("Otro"));

            ResponseStatusException e = assertThrows(ResponseStatusException.class,
                    () -> service.darDeBaja(c.getId(), null, null));
            assertEquals(404, e.getStatusCode().value());
        }
    }

    @Nested
    @DisplayName("la consulta del mostrador (el llavero que su copia no conoce)")
    class Consulta {

        @Test
        @DisplayName("⭐ si lo asignaron en otra PC, dice de quién es")
        void asignadoEnOtraPc() {
            service.asignar(ana, " 0012345678 ", false, null);

            LlaveroService.Consulta c = service.consultar("0012345678");

            assertEquals("0012345678", c.codigo());
            assertNotNull(c.activo());
            assertEquals(ana, c.dueno().getId());
            assertNull(c.ultimaBaja());
        }

        @Test
        @DisplayName("⭐ si se dio de baja, dice a quién se le perdió y cuándo")
        void dadoDeBaja() {
            MemberCredential c = service.asignar(ana, "0012345678", false, null).llavero();
            service.darDeBaja(c.getId(), "Lo perdió", null);

            LlaveroService.Consulta consulta = service.consultar("0012345678");

            assertNull(consulta.activo());
            assertEquals("Lo perdió", consulta.ultimaBaja().getMotivoBaja());
            assertEquals("Ana Pérez", consulta.duenoAnterior().getFullName());
        }

        @Test
        @DisplayName("uno que nunca se asignó vuelve vacío, y uno inválido también, sin error")
        void nuncaAsignado() {
            LlaveroService.Consulta c = service.consultar("0099999999");
            assertNull(c.activo());
            assertNull(c.ultimaBaja());

            assertNull(service.consultar("x").activo());
        }

        @Test
        @DisplayName("el de un socio en la papelera es como si no fuera de nadie")
        void delaPapelera() {
            service.asignar(ana, "0012345678", false, null);
            aLaPapelera(ana);

            assertNull(service.consultar("0012345678").activo());
        }
    }

    @Nested
    @DisplayName("el buscador del servidor")
    class Buscador {

        @Test
        @DisplayName("⭐ encuentra al socio por su llavero, exacto")
        void encuentraPorLlavero() {
            service.asignar(ana, "0099887766", false, null);

            var encontrados = memberService.findPageForCurrentTenant("0099887766", Pageable.unpaged());

            assertEquals(1, encontrados.getTotalElements());
            assertEquals(ana, encontrados.getContent().get(0).getId());
        }

        @Test
        @DisplayName("🔴 un pedazo del llavero no encuentra a nadie: un llavero parecido es otra persona")
        void unPedazoNoEncuentra() {
            service.asignar(ana, "0099887766", false, null);

            assertEquals(0, memberService.findPageForCurrentTenant("998877", Pageable.unpaged()).getTotalElements());
        }

        @Test
        @DisplayName("uno dado de baja ya no encuentra a su ex dueño")
        void elDadoDeBajaNoEncuentra() {
            MemberCredential c = service.asignar(ana, "0099887766", false, null).llavero();
            service.darDeBaja(c.getId(), "Lo perdió", null);

            assertEquals(0, memberService.findPageForCurrentTenant("0099887766", Pageable.unpaged()).getTotalElements());
        }
    }

    @Nested
    @DisplayName("los llaveros que vinieron en el DNI (ControlFit)")
    class EnElDocumento {

        @Test
        @DisplayName("⭐ propone a los que tienen un número largo en el DNI, y a nadie más")
        void proponeLosLargos() {
            UUID conLlavero = crearSocio(gym, "Larissa", "Cipriano", "0012345678");
            UUID extranjero = crearSocio(gym, "Joao", "Silva", "12345678901");
            crearSocio(gym, "Rellenado", "Con cero", "01234567");
            crearSocio(gym, "Con puntos", "Viejo", "30.111.222");

            List<UUID> propuestos = service.candidatosEnElDocumento().stream()
                    .map(LlaveroService.Candidato::socioId).toList();

            // En orden alfabético. El CPF de once dígitos sale también: por eso es una lista para
            // revisar y no una conversión automática. Ni el DNI rellenado con un cero ni el de
            // puntos (ni los de Ana y Beto) parecen llaveros.
            assertEquals(List.of(extranjero, conLlavero), propuestos);
        }

        @Test
        @DisplayName("⭐ pasarlos crea el llavero y NO toca el documento")
        void pasarCreaElLlaveroSinTocarElDocumento() {
            UUID larissa = crearSocio(gym, "Larissa", "Cipriano", "0012345678");

            LlaveroService.PasoDelDocumento paso = service.pasarDelDocumento(List.of(larissa), "Gustavo");

            assertEquals(1, paso.pasados());
            assertEquals(List.of("0012345678"), service.activosPorSocio().get(larissa));
            em.clear();
            assertEquals("0012345678", memberService.findByIdAndVerifyOwnership(larissa).getDocument());
            // Y ya no se vuelve a proponer.
            assertTrue(service.candidatosEnElDocumento().stream().noneMatch(c -> c.socioId().equals(larissa)));
        }

        @Test
        @DisplayName("saltea al que no tiene forma de llavero, al de otro gimnasio y al que pisaría a otro")
        void salteaLoQueNoCorresponde() {
            UUID larissa = crearSocio(gym, "Larissa", "Cipriano", "0012345678");
            UUID repetida = crearSocio(gym, "Repetida", "Ficha", "0012345678");
            UUID ajeno = crearSocio(crearGimnasio("Otro"), "Ajeno", "Socio", "0055555555");

            LlaveroService.PasoDelDocumento paso = service.pasarDelDocumento(
                    List.of(ana, larissa, repetida, ajeno, larissa), null);

            assertEquals(1, paso.pasados(), "solo Larissa");
            assertEquals(3, paso.salteados(), "Ana (DNI), la ficha repetida y el de otro gimnasio");
            assertEquals(Map.of(larissa, List.of("0012345678")), service.activosPorSocio());
        }

        @Test
        @DisplayName("si el número ya es el llavero de otro, se propone igual pero diciendo de quién es")
        void yaEsDeOtro() {
            service.asignar(beto, "0012345678", false, null);
            UUID larissa = crearSocio(gym, "Larissa", "Cipriano", "0012345678");

            LlaveroService.Candidato c = service.candidatosEnElDocumento().stream()
                    .filter(x -> x.socioId().equals(larissa)).findFirst().orElseThrow();

            assertEquals("Beto Gómez", c.yaEsDe());
        }

        @Test
        @DisplayName("el que está en la papelera no se propone")
        void laPapeleraNo() {
            UUID larissa = crearSocio(gym, "Larissa", "Cipriano", "0012345678");
            aLaPapelera(larissa);

            assertTrue(service.candidatosEnElDocumento().isEmpty());
        }
    }
}
