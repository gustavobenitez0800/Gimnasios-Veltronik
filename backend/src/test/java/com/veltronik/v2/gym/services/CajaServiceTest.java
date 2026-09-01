package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.repositories.CajaCierreRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * El arqueo de caja.
 *
 * <p>Lo que se defiende acá no es una cuenta: es que <b>a quien atiende le cueste avivarse</b>.
 * Cada test corresponde a una forma concreta de escaparse.</p>
 */
class CajaServiceTest {

    private static final UUID TENANT = UUID.randomUUID();

    private CajaCierreRepository cierres;
    private GymPaymentRepository pagos;
    private CajaService service;

    @BeforeEach
    void setUp() {
        cierres = mock(CajaCierreRepository.class);
        pagos = mock(GymPaymentRepository.class);
        // El rastro de ajustes se simula: acá se prueba el arqueo, no el rastro.
        service = new CajaService(cierres, pagos,
                mock(com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository.class));
        TenantContextHolder.setTenantId(TENANT);
        when(cierres.save(any(CajaCierre.class))).thenAnswer(i -> i.getArgument(0));
        when(cierres.findTopByTenantIdOrderByHastaDesc(TENANT)).thenReturn(Optional.empty());
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private GymPayment pago(String metodo, String estado, String monto) {
        GymPayment p = new GymPayment();
        p.setPaymentMethod(metodo);
        p.setStatus(estado);
        p.setAmount(new BigDecimal(monto));
        p.setPaymentDate(LocalDateTime.now().minusHours(1));
        return p;
    }

    private void hayPagos(GymPayment... lista) {
        when(pagos.findByTenantIdAndDateRange(eq(TENANT), any(), any())).thenReturn(List.of(lista));
    }

    @Nested
    @DisplayName("lo que cuenta el sistema")
    class LoQueCuenta {

        @Test
        @DisplayName("separa efectivo, transferencia y tarjeta")
        void separaPorMetodo() {
            hayPagos(pago("CASH", "paid", "48000"), pago("TRANSFER", "paid", "45000"),
                    pago("CARD", "paid", "10000"), pago("CASH", "paid", "2000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.efectivo().compareTo(new BigDecimal("50000")));
            assertEquals(0, r.transferencia().compareTo(new BigDecimal("45000")));
            assertEquals(0, r.tarjeta().compareTo(new BigDecimal("10000")));
            assertEquals(4, r.cantidadCobros());
        }

        @Test
        @DisplayName("un pago pendiente NO cuenta: no puso plata en ningún cajón")
        void ignoraLosNoCobrados() {
            hayPagos(pago("CASH", "paid", "48000"), pago("CASH", "pending", "99999"));

            var r = service.resumenAbierto();

            assertEquals(0, r.efectivo().compareTo(new BigDecimal("48000")));
            assertEquals(1, r.cantidadCobros());
        }

        @Test
        @DisplayName("un método raro cae en 'otros' en vez de perderse")
        void metodoDesconocido() {
            hayPagos(pago("MERCADOPAGO", "paid", "30000"));
            assertEquals(0, service.resumenAbierto().otros().compareTo(new BigDecimal("30000")));
        }
    }

    @Nested
    @DisplayName("el cierre")
    class ElCierre {

        // ⭐ El test que sostiene el módulo entero.
        @Test
        @DisplayName("RECEPCIÓN NO PUEDE cerrar sin contar la plata")
        void recepcionTieneQueContar() {
            hayPagos(pago("CASH", "paid", "50000"));

            var e = assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(null, null, "Carla", false));

            assertTrue(e.getMessage().contains("contar"));
            verify(cierres, never()).save(any());
        }

        @Test
        @DisplayName("el dueño SÍ puede cortar sin contar, y queda marcado")
        void elDuenoPuedeCortar() {
            // Puede estar cerrando el mes desde su casa, sin ningún cajón adelante. Mentir
            // que contó sería peor: el historial mostraría un arqueo que nunca existió.
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(null, null, "Hugo", true);

            assertFalse(c.isConArqueo());
            assertNull(c.getDeclaradoEfectivo());
            assertNull(c.getDiferencia(), "sin conteo no hay diferencia que informar");
        }

        @Test
        @DisplayName("cuando cuadra, la diferencia es cero")
        void cuadra() {
            hayPagos(pago("CASH", "paid", "50000"), pago("TRANSFER", "paid", "45000"));

            CajaCierre c = service.cerrar(new BigDecimal("50000"), null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum());
            assertTrue(c.isConArqueo());
        }

        @Test
        @DisplayName("si falta plata, la diferencia es NEGATIVA")
        void faltaPlata() {
            // El signo importa: la pantalla del dueño ordena por esto para encontrar los
            // faltantes, y un signo al revés convertiría un robo en un sobrante.
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(new BigDecimal("47500"), "di mal el vuelto", "Carla", false);

            assertEquals(0, c.getDiferencia().compareTo(new BigDecimal("-2500")));
            assertEquals("di mal el vuelto", c.getNota());
        }

        @Test
        @DisplayName("las transferencias NO entran en la diferencia")
        void laTransferenciaNoSeCuenta() {
            // Una transferencia no se puede robar: va a la cuenta del gimnasio. Si entrara
            // en la cuenta del cajón, todos los cierres darían un faltante gigante y la
            // función se volvería ruido que nadie mira.
            hayPagos(pago("CASH", "paid", "50000"), pago("TRANSFER", "paid", "200000"));

            CajaCierre c = service.cerrar(new BigDecimal("50000"), null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum());
            assertEquals(0, c.getEsperadoTransferencia().compareTo(new BigDecimal("200000")),
                    "pero sí se guarda, para conciliar contra el banco");
        }

        @Test
        @DisplayName("no se acepta un efectivo negativo")
        void nadaDeNegativos() {
            hayPagos(pago("CASH", "paid", "50000"));
            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("-1"), null, "Carla", false));
        }

        @Test
        @DisplayName("el nombre de quien cerró queda congelado en el registro")
        void congelaElNombre() {
            // El id del cajero ya viaja aparte, pero si mañana ese empleado se da de baja el
            // cierre tiene que seguir diciendo quién lo hizo: sin nombres no hay patrón por
            // persona, que es para lo que existe el historial.
            hayPagos(pago("CASH", "paid", "1000"));
            assertEquals("Carla", service.cerrar(new BigDecimal("1000"), null, "Carla", false).getCerradoPorNombre());
        }
    }

    @Nested
    @DisplayName("el período")
    class ElPeriodo {

        @Test
        @DisplayName("arranca donde terminó el cierre anterior")
        void encadenaConElAnterior() {
            LocalDateTime finAnterior = LocalDateTime.now().minusHours(6);
            CajaCierre anterior = new CajaCierre();
            anterior.setHasta(finAnterior);
            when(cierres.findTopByTenantIdOrderByHastaDesc(TENANT)).thenReturn(Optional.of(anterior));
            hayPagos(pago("CASH", "paid", "1000"));

            CajaCierre c = service.cerrar(new BigDecimal("1000"), null, "Carla", false);

            assertEquals(finAnterior, c.getDesde(), "sin esto, un período contaría cobros ya arqueados");
        }

        @Test
        @DisplayName("el PRIMER cierre no arrastra toda la historia del gimnasio")
        void elPrimeroNoArrastraTodo() {
            // Un gimnasio que viene de migrar tiene meses de cobros importados. Si el primer
            // arqueo los tomara, daría un faltante enorme y sin sentido — la peor forma de
            // estrenar la función.
            hayPagos(pago("CASH", "paid", "1000"));

            CajaCierre c = service.cerrar(new BigDecimal("1000"), null, "Carla", false);

            assertTrue(c.getDesde().isAfter(LocalDateTime.now().minusDays(31)));
        }
    }
}
