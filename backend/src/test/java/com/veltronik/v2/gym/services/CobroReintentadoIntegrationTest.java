package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.entities.GymPlan;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ⭐ UN COBRO REINTENTADO NO PUEDE REGALAR UN MES.
 *
 * <p>Es la regla que hace posible cobrar sin internet, y el motivo por el que acá el sello
 * importa más que en los accesos.</p>
 *
 * <p><b>El daño no es la fila de más.</b> {@code aplicarPeriodoDelPlan} arranca el período
 * <i>donde termina la cobertura vigente del socio</i> —está bien pensado: el que paga el 25
 * teniendo cuota hasta el 30 no pierde esos cinco días—. Pero eso significa que una segunda
 * copia del mismo cobro arrancaría <b>donde terminó la primera</b>: el socio se lleva 30 días
 * gratis y el ingreso del día queda contado dos veces en el arqueo.</p>
 *
 * <p>Contra Postgres de verdad porque lo que se prueba es la combinación de tres cosas que solo
 * existen juntas ahí: la consulta por sello, el efecto lateral sobre el socio, y el índice
 * único de la V63 que es el que de verdad garantiza.</p>
 */
@Transactional
class CobroReintentadoIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymPaymentService paymentService;

    private UUID gym;
    private UUID socio;
    private UUID arancel;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio del cobro', true)
                """).setParameter("id", gym).executeUpdate();

        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :gym, 'Socio', 'Del Cobro', :email, :doc, true, NULL, now(), now())
                """)
                .setParameter("id", socio)
                .setParameter("gym", gym)
                .setParameter("email", socio + "@test.com")
                .setParameter("doc", socio.toString().substring(0, 8))
                .executeUpdate();

        arancel = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_plans (id, tenant_id, name, price, duration_days, is_active,
                                       created_at, updated_at)
                VALUES (:id, :gym, 'Mensual', 45000, 30, true, now(), now())
                """)
                .setParameter("id", arancel)
                .setParameter("gym", gym)
                .executeUpdate();

        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /** Un cobro como el que arma el mostrador: con su arancel y con su sello. */
    private GymPayment cobro(UUID sello) {
        GymPayment p = new GymPayment();
        p.setMemberId(socio);
        GymPlan plan = new GymPlan();
        plan.setId(arancel);
        p.setPlan(plan);
        p.setAmount(new BigDecimal("45000"));
        p.setPaymentDate(LocalDateTime.now());
        p.setStatus("PAID");
        p.setClientRef(sello);
        return p;
    }

    private LocalDateTime vencimientoDelSocio() {
        em.flush();
        em.clear();
        return em.find(GymMember.class, socio).getMembershipEnd();
    }

    private long cuantosCobros() {
        em.flush();
        Object n = em.createNativeQuery(
                        "SELECT COUNT(*) FROM gym_payments WHERE tenant_id = :gym AND member_id = :socio")
                .setParameter("gym", gym).setParameter("socio", socio).getSingleResult();
        return ((Number) n).longValue();
    }

    @Test
    @DisplayName("⭐⭐ el mismo cobro dos veces NO le regala un mes al socio")
    void elReintentoNoExtiendeDeNuevo() {
        UUID sello = UUID.randomUUID();

        paymentService.saveForCurrentTenant(cobro(sello));
        LocalDateTime despuesDelPrimero = vencimientoDelSocio();

        paymentService.saveForCurrentTenant(cobro(sello));

        assertEquals(despuesDelPrimero, vencimientoDelSocio(),
                "la segunda copia arrancaría donde terminó la primera: 30 días gratis");
        assertEquals(1, cuantosCobros(), "y el ingreso del día quedaría contado dos veces");
    }

    @Test
    @DisplayName("el reintento devuelve EL MISMO cobro, no uno nuevo")
    void elReintentoDevuelveElQueYaEstaba() {
        UUID sello = UUID.randomUUID();

        GymPayment primero = paymentService.saveForCurrentTenant(cobro(sello));
        GymPayment segundo = paymentService.saveForCurrentTenant(cobro(sello));

        assertEquals(primero.getId(), segundo.getId(),
                "quien reintenta tiene que poder mostrar el cobro real, no un eco");
    }

    @Test
    @DisplayName("dos cobros DISTINTOS del mismo socio sí extienden dos veces")
    void dosCobrosDistintosSiSuman() {
        // La contraparte: pagar dos meses de una tiene que correr la fecha dos veces. Si la
        // guarda del sello fuera de más, el segundo mes no se le acreditaría a nadie.
        paymentService.saveForCurrentTenant(cobro(UUID.randomUUID()));
        LocalDateTime unMes = vencimientoDelSocio();

        paymentService.saveForCurrentTenant(cobro(UUID.randomUUID()));

        assertTrue(vencimientoDelSocio().isAfter(unMes), "el segundo mes tiene que sumarse");
        assertEquals(2, cuantosCobros());
    }

    @Test
    @DisplayName("sin sello todo sigue exactamente como antes")
    void sinSelloNoCambiaNada() {
        // Es el camino del portal web y el de todo lo cobrado hasta ahora. Dos cobros sin sello
        // son dos cobros: no hay nada con qué reconocerlos, y no tiene por qué haberlo.
        paymentService.saveForCurrentTenant(cobro(null));
        paymentService.saveForCurrentTenant(cobro(null));

        assertEquals(2, cuantosCobros());
    }

    @Test
    @DisplayName("⚠️ el sello de OTRO gimnasio no bloquea el cobro de este")
    void elSelloEsPorGimnasio() {
        UUID sello = UUID.randomUUID();
        paymentService.saveForCurrentTenant(cobro(sello));

        UUID otroGym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Otro gimnasio', true)
                """).setParameter("id", otroGym).executeUpdate();
        UUID otroSocio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, created_at, updated_at)
                VALUES (:id, :gym, 'Otro', 'Socio', :email, :doc, true, now(), now())
                """)
                .setParameter("id", otroSocio).setParameter("gym", otroGym)
                .setParameter("email", otroSocio + "@test.com")
                .setParameter("doc", otroSocio.toString().substring(0, 8))
                .executeUpdate();

        TenantContextHolder.setTenantId(otroGym);
        GymPayment p = new GymPayment();
        p.setMemberId(otroSocio);
        p.setAmount(new BigDecimal("30000"));
        p.setPaymentDate(LocalDateTime.now());
        p.setStatus("PAID");
        p.setClientRef(sello);

        GymPayment guardado = paymentService.saveForCurrentTenant(p);

        assertSame(p, guardado, "no puede devolver el cobro del otro gimnasio");
        em.flush();
    }
}
