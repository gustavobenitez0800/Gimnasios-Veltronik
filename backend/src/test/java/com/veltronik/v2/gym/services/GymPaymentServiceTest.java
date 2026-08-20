package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * COBRAR UNA CUOTA CORRE EL VENCIMIENTO DEL SOCIO.
 *
 * <p>Antes esto lo hacía el navegador en dos requests, con la segunda envuelta en un
 * catch vacío: si fallaba, el pago quedaba guardado y el socio seguía figurando como
 * vencido, en silencio. Con un molinete en la puerta eso deja afuera a alguien que pagó,
 * así que pasó a ser una sola operación del servidor.</p>
 *
 * <p>Los casos de "NO tiene que tocar nada" pesan tanto como los otros: esta lógica corre
 * en cada cobro de cada gimnasio, y moverle la fecha de membresía a quien no corresponde
 * es regalar o sacar meses de servicio.</p>
 */
class GymPaymentServiceTest {

    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID SOCIO = UUID.randomUUID();

    private GymPaymentRepository repository;
    private GymMemberService memberService;
    private GymPaymentService service;

    private GymMember socio;

    @BeforeEach
    void setUp() {
        repository = mock(GymPaymentRepository.class);
        memberService = mock(GymMemberService.class);
        service = new GymPaymentService(repository, memberService);

        TenantContextHolder.setTenantId(TENANT);

        socio = new GymMember();
        socio.setId(SOCIO);
        socio.setFirstName("Juan");
        socio.setLastName("Pérez");
        socio.setEmail("juan@gimnasio.com");
        socio.setActive(true);

        when(memberService.findByIdAndVerifyOwnership(SOCIO)).thenReturn(socio);
        when(repository.save(any(GymPayment.class))).thenAnswer(i -> i.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private GymPayment pago(String status, LocalDateTime cubreHasta) {
        GymPayment p = new GymPayment();
        p.setMemberId(SOCIO);
        p.setAmount(new BigDecimal("30000"));
        p.setPaymentDate(LocalDateTime.now());
        p.setStatus(status);
        p.setPeriodEnd(cubreHasta);
        return p;
    }

    /** ¿Se guardó al socio con la cobertura corrida? */
    private void assertCoberturaHasta(LocalDateTime esperado) {
        verify(memberService).saveForCurrentTenant(socio);
        assertThat(socio.getMembershipEnd()).isEqualTo(esperado);
    }

    private void assertNoSeTocoAlSocio(LocalDateTime coberturaOriginal) {
        verify(memberService, never()).saveForCurrentTenant(any());
        assertThat(socio.getMembershipEnd()).isEqualTo(coberturaOriginal);
    }

    // ── Lo que SÍ tiene que pasar ──────────────────────────────────────────────

    @Nested
    @DisplayName("Cuando la plata entró")
    class PlataQueEntro {

        @Test
        @DisplayName("Cobrar el mes que viene corre el vencimiento")
        void cobrarCorreElVencimiento() {
            LocalDateTime vencia = LocalDateTime.of(2026, 8, 10, 23, 59);
            LocalDateTime nuevo = LocalDateTime.of(2026, 9, 10, 23, 59);
            socio.setMembershipEnd(vencia);

            service.saveForCurrentTenant(pago("paid", nuevo));

            assertCoberturaHasta(nuevo);
        }

        @Test
        @DisplayName("Socio nuevo sin vencimiento: se lo establece")
        void socioSinVencimientoPrevio() {
            LocalDateTime hasta = LocalDateTime.of(2026, 9, 10, 23, 59);
            socio.setMembershipEnd(null);

            service.saveForCurrentTenant(pago("paid", hasta));

            assertCoberturaHasta(hasta);
        }

        @Test
        @DisplayName("Da igual si el estado viene 'paid' o 'PAID'")
        void elEstadoNoDistingueMayusculas() {
            // La entidad nace con "PAID" y el frontend manda "paid": si esto distinguiera,
            // la cobertura se extendería para unos pagos sí y otros no según por dónde entraron.
            LocalDateTime hasta = LocalDateTime.of(2026, 9, 10, 23, 59);
            socio.setMembershipEnd(null);

            service.saveForCurrentTenant(pago("PAID", hasta));

            assertCoberturaHasta(hasta);
        }

        @Test
        @DisplayName("Un socio dado de baja que vuelve a pagar queda activo de nuevo")
        void volverAPagarReactiva() {
            socio.setActive(false);
            socio.setMembershipEnd(LocalDateTime.of(2026, 3, 1, 23, 59));

            service.saveForCurrentTenant(pago("paid", LocalDateTime.of(2026, 9, 10, 23, 59)));

            assertThat(socio.isActive()).isTrue();
        }
    }

    // ── El estado del pago, con una sola caja ──────────────────────────────────

    @Nested
    @DisplayName("Normalización del estado")
    class EstadoNormalizado {

        /** Devuelve el pago tal como quedó guardado. */
        private GymPayment guardar(GymPayment p) {
            return service.saveForCurrentTenant(p);
        }

        @Test
        @DisplayName("'PAID' se guarda como 'paid'")
        void mayusculaSeNormaliza() {
            assertThat(guardar(pago("PAID", null)).getStatus()).isEqualTo("paid");
        }

        @Test
        @DisplayName("'Pending' se guarda como 'pending'")
        void mezclaSeNormaliza() {
            assertThat(guardar(pago("Pending", null)).getStatus()).isEqualTo("pending");
        }

        @Test
        @DisplayName("Espacios al costado no cuentan")
        void seRecortanEspacios() {
            assertThat(guardar(pago("  paid  ", null)).getStatus()).isEqualTo("paid");
        }

        @Test
        @DisplayName("Sin estado se asume cobrado")
        void sinEstadoEsCobrado() {
            // Registrar un pago sin decir nada significa que la plata entró; es el mismo
            // criterio que el default de la entidad.
            assertThat(guardar(pago(null, null)).getStatus()).isEqualTo("paid");
            assertThat(guardar(pago("   ", null)).getStatus()).isEqualTo("paid");
        }

        @Test
        @DisplayName("Un pago que entra en mayúscula igual extiende la cobertura")
        void normalizarNoRompeLaExtension() {
            // Esta era la trampa: si la normalización corriera DESPUÉS de decidir la
            // cobertura, o si la comparación fuera exacta, el mismo pago haría cosas
            // distintas según cómo escribieron el estado.
            LocalDateTime hasta = LocalDateTime.of(2026, 9, 10, 23, 59);
            socio.setMembershipEnd(null);

            guardar(pago("PAID", hasta));

            assertCoberturaHasta(hasta);
        }
    }

    // ── Lo que NO tiene que pasar ──────────────────────────────────────────────

    @Nested
    @DisplayName("Cuando NO corresponde tocar la membresía")
    class NoCorresponde {

        @Test
        @DisplayName("Un pago viejo NUNCA acorta una membresía vigente")
        void elPagoCorrectivoNoRetrocedeLaFecha() {
            // Caso real: el dueño carga en septiembre una cuota de marzo que se había
            // olvidado. Si esto moviera la fecha, le sacaría seis meses a alguien que está
            // al día — y con molinete, lo dejaría en la puerta.
            LocalDateTime vigente = LocalDateTime.of(2026, 9, 10, 23, 59);
            socio.setMembershipEnd(vigente);

            service.saveForCurrentTenant(pago("paid", LocalDateTime.of(2026, 3, 31, 23, 59)));

            assertNoSeTocoAlSocio(vigente);
        }

        @Test
        @DisplayName("Un pago viejo tampoco reactiva a quien el dueño dio de baja")
        void elPagoCorrectivoNoReactiva() {
            socio.setActive(false);
            socio.setMembershipEnd(LocalDateTime.of(2026, 9, 10, 23, 59));

            service.saveForCurrentTenant(pago("paid", LocalDateTime.of(2026, 3, 31, 23, 59)));

            assertThat(socio.isActive()).isFalse();
        }

        @Test
        @DisplayName("Un pago PENDIENTE no habilita nada")
        void elPagoPendienteNoExtiende() {
            LocalDateTime vigente = LocalDateTime.of(2026, 8, 10, 23, 59);
            socio.setMembershipEnd(vigente);

            service.saveForCurrentTenant(pago("pending", LocalDateTime.of(2026, 9, 10, 23, 59)));

            assertNoSeTocoAlSocio(vigente);
        }

        @Test
        @DisplayName("Sin período de cobertura no se sabe hasta cuándo: no se toca")
        void sinPeriodoNoExtiende() {
            LocalDateTime vigente = LocalDateTime.of(2026, 8, 10, 23, 59);
            socio.setMembershipEnd(vigente);

            service.saveForCurrentTenant(pago("paid", null));

            assertNoSeTocoAlSocio(vigente);
        }

        @Test
        @DisplayName("Volver a guardar el mismo pago no cambia nada (idempotente)")
        void guardarDosVecesEsInofensivo() {
            // Importa porque 'marcar como pagado' entra por el mismo camino que el alta:
            // el PUT vuelve a pasar por acá con el mismo período.
            LocalDateTime hasta = LocalDateTime.of(2026, 9, 10, 23, 59);
            socio.setMembershipEnd(null);

            service.saveForCurrentTenant(pago("paid", hasta));
            service.saveForCurrentTenant(pago("paid", hasta));

            assertThat(socio.getMembershipEnd()).isEqualTo(hasta);
            verify(memberService, times(1)).saveForCurrentTenant(socio); // la 2ª vez ya no hay nada que mover
        }

        @Test
        @DisplayName("Un pago sin socio no rompe el cobro")
        void pagoSinSocioNoExplota() {
            GymPayment huerfano = new GymPayment();
            huerfano.setAmount(new BigDecimal("30000"));
            huerfano.setPaymentDate(LocalDateTime.now());
            huerfano.setStatus("paid");
            huerfano.setPeriodEnd(LocalDateTime.of(2026, 9, 10, 23, 59));

            service.saveForCurrentTenant(huerfano);

            verify(repository).save(huerfano);
            verify(memberService, never()).saveForCurrentTenant(any());
        }
    }
}
