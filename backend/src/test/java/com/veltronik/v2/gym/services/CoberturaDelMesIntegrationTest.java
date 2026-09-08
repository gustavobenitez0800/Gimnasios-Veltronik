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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * ⭐ LO QUE HACE VENCER AL SOCIO ES EL MES. Ver ADR-013.
 *
 * <p>Lo dijo el dueño mirando la pantalla de cobro: <i>"los aranceles no definen el vencimiento;
 * lo que hace que el alumno venza es el mes, simple. Paga el 7 de marzo y vence el 7 de abril.
 * Los aranceles son para saber qué tipo de entrenamiento eligió"</i>.</p>
 *
 * <p>El sistema hacía lo contrario de dos maneras, y las dos se prueban acá: un cobro sin
 * arancel no movía nada, y "30 días" no es "un mes".</p>
 */
@Transactional
class CoberturaDelMesIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private GymPaymentService paymentService;

    private UUID gym;
    private UUID socio;

    @BeforeEach
    void sembrar() {
        gym = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), 'Gimnasio del mes', true)
                """).setParameter("id", gym).executeUpdate();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    /** Un socio cuya cobertura vence en la fecha indicada (null = nunca pagó). */
    private void crearSocio(LocalDateTime vence) {
        socio = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_members (id, tenant_id, first_name, last_name, email, document,
                                         is_active, membership_end, created_at, updated_at)
                VALUES (:id, :gym, 'Socio', 'Del Mes', :email, :doc, true, :vence, now(), now())
                """)
                .setParameter("id", socio).setParameter("gym", gym)
                .setParameter("email", socio + "@test.com")
                .setParameter("doc", socio.toString().substring(0, 8))
                .setParameter("vence", vence)
                .executeUpdate();
    }

    private UUID crearArancel(String nombre, int cantidad, String unidad) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO gym_plans (id, tenant_id, name, price, duration_days,
                                       cobertura_cantidad, cobertura_unidad, is_active,
                                       created_at, updated_at)
                VALUES (:id, :gym, :nombre, 45000, 0, :cant, :uni, true, now(), now())
                """)
                .setParameter("id", id).setParameter("gym", gym).setParameter("nombre", nombre)
                .setParameter("cant", cantidad).setParameter("uni", unidad)
                .executeUpdate();
        return id;
    }

    private GymPayment cobrar(UUID arancel) {
        GymPayment p = new GymPayment();
        p.setMemberId(socio);
        if (arancel != null) {
            GymPlan plan = new GymPlan();
            plan.setId(arancel);
            p.setPlan(plan);
        }
        p.setAmount(new BigDecimal("45000"));
        p.setPaymentDate(LocalDateTime.now());
        p.setStatus("PAID");
        return paymentService.saveForCurrentTenant(p);
    }

    private LocalDateTime vencimiento() {
        em.flush();
        em.clear();
        return em.find(GymMember.class, socio).getMembershipEnd();
    }

    @Test
    @DisplayName("⭐⭐ cobrar SIN arancel corre un mes igual")
    void sinArancelTambienCorreElMes() {
        // Era el bug que más molestaba: "monto a mano" es lo que el mostrador usa todo el
        // tiempo, y no movía el vencimiento ni un día. La plata entraba y el socio seguía
        // vencido, sin que nadie se enterara hasta que no lo dejaban entrar.
        LocalDateTime vence = LocalDate.now().plusDays(5).atStartOfDay();
        crearSocio(vence);

        cobrar(null);

        assertEquals(vence.plusMonths(1), vencimiento(),
                "sin arancel la cuota igual corre un mes: el arancel es una etiqueta");
    }

    @Test
    @DisplayName("⭐ un mes es el MISMO DÍA del mes que viene, no 30 días")
    void elMesEsElMismoDia() {
        // 7 de marzo + 30 días = 6 de abril. La regla del negocio dice 7 de abril.
        LocalDateTime siete = LocalDateTime.of(2027, 3, 7, 10, 0);
        crearSocio(siete);

        cobrar(crearArancel("Mensual", 1, "MES"));

        assertEquals(LocalDateTime.of(2027, 4, 7, 10, 0), vencimiento(),
                "el 7 vence el 7: con días caía el 6");
    }

    @Test
    @DisplayName("⚠️ y si ese día no existe, vence el último que exista")
    void elTreintaYUnoNoSeVaDeMes() {
        // Paga un 31 de enero. El 31 de febrero no existe.
        LocalDateTime treintaYUno = LocalDateTime.of(2027, 1, 31, 10, 0);
        crearSocio(treintaYUno);

        cobrar(crearArancel("Mensual", 1, "MES"));

        assertEquals(LocalDateTime.of(2027, 2, 28, 10, 0), vencimiento(),
                "el último día que exista es lo que la gente espera");
    }

    @Test
    @DisplayName("un arancel de varios meses suma esos meses")
    void elTrimestralSumaTresMeses() {
        LocalDateTime marzo = LocalDateTime.of(2027, 3, 7, 10, 0);
        crearSocio(marzo);

        cobrar(crearArancel("Trimestral", 3, "MES"));

        assertEquals(LocalDateTime.of(2027, 6, 7, 10, 0), vencimiento());
    }

    @Test
    @DisplayName("⭐ y el Pase Semanal sigue siendo una semana: la lista también tiene días")
    void elPaseSemanalSumaSieteDias() {
        // De los once aranceles que vende HaA Fitness, tres NO son meses: Pase Diario (1 día),
        // Pase Semanal (7) y Pase Bimestral (2 meses). Una lista solo de meses le rompía tres
        // productos al único cliente grande.
        LocalDateTime marzo = LocalDateTime.of(2027, 3, 7, 10, 0);
        crearSocio(marzo);

        cobrar(crearArancel("Pase Semanal", 7, "DIA"));

        assertEquals(LocalDateTime.of(2027, 3, 14, 10, 0), vencimiento());
    }

    @Test
    @DisplayName("un arancel que NO cubre tiempo cobra la plata y no corre la fecha")
    void laClaseSueltaNoCorreNada() {
        // La contraparte de todo lo anterior: si cualquier cobro diera un mes, vender una clase
        // suelta regalaría el mes entero. Por eso "no cubre tiempo" existe y va explícito.
        LocalDateTime vence = LocalDate.now().plusDays(5).atStartOfDay();
        crearSocio(vence);

        cobrar(crearArancel("Pase Diario suelto", 0, "DIA"));

        assertEquals(vence, vencimiento(), "cobra plata, no mueve la fecha");
    }

    @Test
    @DisplayName("el socio vencido arranca desde HOY, no desde su vencimiento viejo")
    void elVencidoArrancaDeCero() {
        LocalDateTime hace3Meses = LocalDateTime.now().minusMonths(3);
        crearSocio(hace3Meses);

        cobrar(null);

        // No se le regalan los meses que estuvo sin pagar: arranca hoy.
        LocalDateTime esperado = LocalDateTime.now().plusMonths(1);
        assertEquals(esperado.toLocalDate(), vencimiento().toLocalDate());
    }

    @Test
    @DisplayName("y el que paga adelantado no pierde los días que le quedaban")
    void elAdelantadoNoPierdeNada() {
        // El que paga el 25 teniendo cuota hasta el 30 no pierde esos cinco días: se le suman.
        LocalDateTime enCincoDias = LocalDate.now().plusDays(5).atStartOfDay();
        crearSocio(enCincoDias);

        cobrar(null);

        assertEquals(enCincoDias.plusMonths(1), vencimiento());
    }

    @Test
    @DisplayName("un cobro sin socio no rompe nada")
    void cobroSinSocio() {
        GymPayment p = new GymPayment();
        p.setAmount(new BigDecimal("10000"));
        p.setPaymentDate(LocalDateTime.now());
        p.setStatus("PAID");

        GymPayment guardado = paymentService.saveForCurrentTenant(p);

        assertNull(guardado.getMember());
    }
}
