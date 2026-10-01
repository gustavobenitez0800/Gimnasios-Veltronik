package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.gym.services.GymMemberService;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 🔴 LO QUE LA LISTA DE SOCIOS SACA DE LA BASE.
 *
 * <p>{@code GET /gym/members} es la copia local del escritorio: la pide cada 5 minutos y el
 * buscador del mostrador la vuelve a pedir en cada tecla. Cada pedido traía de Supabase todas
 * las columnas de todos los socios, y Supabase cobra lo que sale de la base (ver
 * {@code MostradorEgressTest} para la historia completa).</p>
 *
 * <p>Estos tests fijan dos cosas a la vez, y hacen falta las dos: que un pedido repetido NO
 * vuelva a la base, y que cualquier cambio que la pantalla tenga que ver —un cobro, un alta,
 * un cambio de arancel, un vencimiento que llega con la hora— SÍ se vea en el pedido
 * siguiente. Una foto que ahorra pero muestra un arancel viejo es peor que no tenerla: el
 * cobro pre-elige el arancel de esta lista.</p>
 *
 * <p>⚠️ Sin {@code @Transactional}, como en producción: la foto vive entre pedidos.</p>
 */
class ListaDeSociosEgressTest extends EmbeddedPostgresTest {

    private static final ZoneId ZONA = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired private EntityManager em;
    @Autowired private EntityManagerFactory emf;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired private GymMemberController controller;
    @Autowired private GymMemberService memberService;

    private TransactionTemplate tx;
    private final List<UUID> gimnasios = new ArrayList<>();
    private UUID gym;
    private UUID mensual;
    private long ahoraFalso;

    @BeforeEach
    void preparar() {
        tx = new TransactionTemplate(txManager);
        gym = crearGimnasio();
        mensual = crearArancel(gym, "Mensual");
        TenantContextHolder.setTenantId(gym);
        ahoraFalso = System.currentTimeMillis();
        elDeVerdad().reloj = () -> ahoraFalso;
        stats().setStatisticsEnabled(true);
    }

    /**
     * ⚠️ El controlador tiene un {@code @PreAuthorize}, así que Spring lo envuelve en un proxy.
     * Un campo escrito en el proxy NO lo ve el controlador: el reloj hay que cambiárselo al de
     * adentro. Escrito sobre el proxy, el test de la media hora pasaba el reloj y la foto no se
     * enteraba.
     */
    private GymMemberController elDeVerdad() {
        return org.springframework.test.util.AopTestUtils.getUltimateTargetObject(controller);
    }

    @AfterEach
    void limpiar() {
        elDeVerdad().reloj = System::currentTimeMillis;
        TenantContextHolder.clear();
        tx.executeWithoutResult(st -> {
            for (UUID t : gimnasios) {
                em.createNativeQuery("DELETE FROM gym_member WHERE tenant_id = :t").setParameter("t", t).executeUpdate();
                em.createNativeQuery("DELETE FROM gym_plan WHERE tenant_id = :t").setParameter("t", t).executeUpdate();
                em.createNativeQuery("DELETE FROM tenant WHERE id = :t").setParameter("t", t).executeUpdate();
            }
        });
        gimnasios.clear();
    }

    // ─── Siembra ────────────────────────────────────────────────────────────────

    private Statistics stats() {
        return emf.unwrap(SessionFactory.class).getStatistics();
    }

    private void enTransaccion(Runnable pasos) {
        tx.executeWithoutResult(st -> pasos.run());
    }

    private UUID crearGimnasio() {
        UUID id = UUID.randomUUID();
        gimnasios.add(id);
        enTransaccion(() -> em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio de prueba', true)
                """).setParameter("id", id).executeUpdate());
        return id;
    }

    private UUID crearArancel(UUID tenant, String nombre) {
        UUID id = UUID.randomUUID();
        enTransaccion(() -> em.createNativeQuery("""
                INSERT INTO gym_plan (id, tenant_id, name, price, duration_days, is_active,
                                       created_at, updated_at)
                VALUES (:id, :t, :n, :p, 30, true, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant).setParameter("n", nombre)
                .setParameter("p", new BigDecimal("25000"))
                .executeUpdate());
        return id;
    }

    private UUID crearSocio(UUID tenant, String nombre, UUID arancel, LocalDateTime vence) {
        UUID id = UUID.randomUUID();
        enTransaccion(() -> em.createNativeQuery("""
                INSERT INTO gym_member (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, plan_id, created_at, updated_at)
                VALUES (:id, :t, :n, 'Prueba', :mail, :doc, true, :vence, :plan, now(), now())
                """)
                .setParameter("id", id).setParameter("t", tenant).setParameter("n", nombre)
                .setParameter("mail", id + "@test.com")
                .setParameter("doc", String.valueOf(System.nanoTime()))
                .setParameter("vence", vence)
                .setParameter("plan", arancel)
                .executeUpdate());
        return id;
    }

    /** Lo que hace JPA al guardar una ficha: cambia un dato y mueve updated_at. */
    private void editar(String tabla, UUID id, String columna, Object valor, LocalDateTime marca) {
        enTransaccion(() -> em.createNativeQuery(
                        "UPDATE " + tabla + " SET " + columna + " = :v, updated_at = :marca WHERE id = :id")
                .setParameter("v", valor).setParameter("marca", marca).setParameter("id", id)
                .executeUpdate());
    }

    private List<GymMemberDTO> pedirLista() {
        return controller.getAllMembers().getBody();
    }

    private GymMemberDTO socio(List<GymMemberDTO> lista, UUID id) {
        return lista.stream().filter(s -> s.getId().equals(id)).findFirst().orElseThrow();
    }

    private LocalDateTime enDias(int dias) {
        return LocalDateTime.now(ZONA).plusDays(dias);
    }

    private void diezSocios() {
        for (int i = 0; i < 10; i++) crearSocio(gym, "Socio" + i, i % 2 == 0 ? mensual : null, enDias(20));
    }

    // ─── La foto ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐ si ningún socio cambió, el segundo pedido no trae ni una ficha de la base")
    void laListaNoVuelveALaBase() {
        diezSocios();
        List<GymMemberDTO> primera = pedirLista();

        stats().clear();
        List<GymMemberDTO> segunda = pedirLista();

        assertEquals(0, stats().getEntityLoadCount(),
                "la lista se volvió a traer entera sin que cambiara nada: el buscador la pide en cada tecla");
        assertTrue(stats().getPrepareStatementCount() <= 2,
                "solo las dos marcas: " + stats().getPrepareStatementCount() + " consultas");
        assertEquals(10, segunda.size());
        assertEquals(primera, segunda);
    }

    @Test
    @DisplayName("un alta se ve en el pedido siguiente")
    void unAltaSeVe() {
        diezSocios();
        assertEquals(10, pedirLista().size());

        crearSocio(gym, "Nuevo", null, enDias(30));

        assertEquals(11, pedirLista().size());
    }

    @Test
    @DisplayName("un cobro se ve en el pedido siguiente: el vencimiento nuevo, no el de la foto")
    void unCobroSeVe() {
        UUID moroso = crearSocio(gym, "Moroso", mensual, enDias(-10));
        assertEquals("VENCIDO", socio(pedirLista(), moroso).getSituacion());

        editar("gym_member", moroso, "membership_end", enDias(30), LocalDateTime.now().plusSeconds(1));

        assertEquals("AL_DIA", socio(pedirLista(), moroso).getSituacion());
    }

    @Test
    @DisplayName("🔴 dos cambios casi simultáneos: el que se guardó con la hora más vieja también se ve")
    void elCambioConHoraViejaTambienSeVe() {
        UUID ana = crearSocio(gym, "Ana", null, enDias(20));
        UUID beto = crearSocio(gym, "Beto", null, enDias(20));
        LocalDateTime base = LocalDateTime.now().plusMinutes(1);

        // Ana se guarda con la hora más nueva y la foto se arma en el medio.
        editar("gym_member", ana, "first_name", "Ana María", base.plusSeconds(2));
        assertEquals("Ana María", socio(pedirLista(), ana).getFirstName());

        // Beto había tomado su hora ANTES que Ana, pero se guardó DESPUÉS. El máximo de
        // updated_at no se mueve; la marca igual tiene que cambiar.
        editar("gym_member", beto, "first_name", "Roberto", base.plusSeconds(1));

        assertEquals("Roberto", socio(pedirLista(), beto).getFirstName(),
                "la marca no vio el cambio de Beto: el cobro de un socio quedaría fuera de la foto");
    }

    @Test
    @DisplayName("🔴 el cambio masivo de arancel se ve en el acto (el cobro pre-elige el arancel de esta lista)")
    void elCambioMasivoDeArancelSeVe() {
        UUID socioId = crearSocio(gym, "Camila", mensual, enDias(20));
        UUID pase = crearArancel(gym, "Pase libre");
        assertEquals("Mensual", socio(pedirLista(), socioId).getPlanNombre());

        // El camino real: un UPDATE masivo, que no pasa por el @PreUpdate de la entidad.
        assertEquals(1, memberService.asignarArancelMasivo(List.of(socioId), pase));

        assertEquals("Pase libre", socio(pedirLista(), socioId).getPlanNombre());
    }

    @Test
    @DisplayName("renombrar un arancel se ve aunque ningún socio haya cambiado")
    void renombrarUnArancelSeVe() {
        UUID socioId = crearSocio(gym, "Camila", mensual, enDias(20));
        assertEquals("Mensual", socio(pedirLista(), socioId).getPlanNombre());

        editar("gym_plan", mensual, "name", "Mensual 2026", LocalDateTime.now().plusSeconds(1));

        assertEquals("Mensual 2026", socio(pedirLista(), socioId).getPlanNombre());
    }

    @Test
    @DisplayName("⭐ la situación se calcula en cada pedido: el que se vence con la foto guardada, se ve vencido")
    void laSituacionEsDeAhora() throws InterruptedException {
        LocalDateTime vence = LocalDateTime.now(ZONA).plusSeconds(3);
        UUID socioId = crearSocio(gym, "JustoHoy", mensual, vence);
        assertEquals("AL_DIA", socio(pedirLista(), socioId).getSituacion());

        long falta = java.time.Duration.between(LocalDateTime.now(ZONA), vence).toMillis();
        Thread.sleep(Math.max(0, falta) + 300);

        stats().clear();
        String ahora = socio(pedirLista(), socioId).getSituacion();
        assertEquals(0, stats().getEntityLoadCount(), "tenía que salir de la foto");
        assertEquals("EN_GRACIA", ahora,
                "la foto guarda las fichas, no la respuesta: el vencimiento se juzga con la hora de AHORA");
    }

    @Test
    @DisplayName("aun sin cambios, la foto vence a la media hora")
    void laFotoVence() {
        diezSocios();
        pedirLista();

        ahoraFalso += GymMemberController.FOTO_VIGENTE_MS + 1;
        stats().clear();
        pedirLista();

        assertTrue(stats().getEntityLoadCount() > 0);
    }

    @Test
    @DisplayName("🔴 cada gimnasio ve SUS socios, nunca la foto de otro")
    void cadaGimnasioSuLista() {
        diezSocios();
        pedirLista();

        UUID otro = crearGimnasio();
        crearSocio(otro, "DelOtro", null, enDias(20));
        TenantContextHolder.setTenantId(otro);
        List<GymMemberDTO> delOtro = pedirLista();

        assertEquals(1, delOtro.size());
        assertEquals("DelOtro", delOtro.get(0).getFirstName());
    }
}
