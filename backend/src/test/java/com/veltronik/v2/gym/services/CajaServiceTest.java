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
    private com.veltronik.v2.gym.repositories.CajaSesionRepository sesiones;
    private com.veltronik.v2.gym.repositories.CajaMovimientoRepository movimientos;
    private CajaService service;

    @BeforeEach
    void setUp() {
        cierres = mock(CajaCierreRepository.class);
        pagos = mock(GymPaymentRepository.class);
        sesiones = mock(com.veltronik.v2.gym.repositories.CajaSesionRepository.class);
        movimientos = mock(com.veltronik.v2.gym.repositories.CajaMovimientoRepository.class);
        // El rastro de ajustes se simula: acá se prueba el arqueo, no el rastro.
        service = new CajaService(cierres, pagos,
                mock(com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository.class), sesiones, movimientos);
        when(sesiones.save(any(com.veltronik.v2.gym.entities.CajaSesion.class))).thenAnswer(i -> i.getArgument(0));
        when(sesiones.findByTenantIdAndCerradaAtIsNull(TENANT)).thenReturn(Optional.empty());
        // Por defecto no hay movimientos: los tests que los necesitan llaman a hayMovimientos().
        when(movimientos.findByTenantIdAndFechaBetweenOrderByFechaDesc(eq(TENANT), any(), any()))
                .thenReturn(List.of());
        when(movimientos.save(any(com.veltronik.v2.gym.entities.CajaMovimiento.class)))
                .thenAnswer(i -> i.getArgument(0));
        TenantContextHolder.setTenantId(TENANT);
        when(cierres.save(any(CajaCierre.class))).thenAnswer(i -> i.getArgument(0));
        when(cierres.findTopByTenantIdOrderByHastaDesc(TENANT)).thenReturn(Optional.empty());
    }

    /** Un movimiento de caja ya cargado, para los tests que necesitan que existan. */
    private com.veltronik.v2.gym.entities.CajaMovimiento movimiento(String tipo, String metodo, String monto) {
        com.veltronik.v2.gym.entities.CajaMovimiento m = new com.veltronik.v2.gym.entities.CajaMovimiento();
        m.setTipo(tipo);
        m.setMetodo(metodo);
        m.setMonto(new BigDecimal(monto));
        m.setCategoria("PROVEEDOR");
        m.setFecha(LocalDateTime.now().minusHours(1));
        return m;
    }

    private void hayMovimientos(com.veltronik.v2.gym.entities.CajaMovimiento... lista) {
        when(movimientos.findByTenantIdAndFechaBetweenOrderByFechaDesc(eq(TENANT), any(), any()))
                .thenReturn(List.of(lista));
    }

    /**
     * Deja una caja abierta con ese fondo.
     *
     * <p>Vive en la clase de afuera y no adentro de un @Nested a propósito: la usan tanto los
     * tests de abrir/cerrar como los de egresos, y duplicarla sería exactamente el patrón que
     * ya mordió en este proyecto — toda cuenta copiada terminó mal en alguna de sus copias.</p>
     */
    private com.veltronik.v2.gym.entities.CajaSesion hayUnaAbierta(String fondo) {
        com.veltronik.v2.gym.entities.CajaSesion s = new com.veltronik.v2.gym.entities.CajaSesion();
        s.setId(UUID.randomUUID());
        s.setAbiertaAt(LocalDateTime.now().minusHours(6));
        s.setAbiertaPorNombre("Carla");
        s.setFondoInicial(new BigDecimal(fondo));
        com.veltronik.v2.core.entities.Tenant t = new com.veltronik.v2.core.entities.Tenant();
        t.setId(TENANT);
        s.setTenant(t);
        when(sesiones.findByTenantIdAndCerradaAtIsNull(TENANT)).thenReturn(Optional.of(s));
        return s;
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
            hayPagos(pago("CHEQUE", "paid", "30000"));
            assertEquals(0, service.resumenAbierto().otros().compareTo(new BigDecimal("30000")));
        }

        // ⭐ EL BUG: Mercado Pago es una de las cuatro opciones que ofrece el sistema al
        // cobrar, pero el cierre no lo reconocía y lo mandaba a "otros" con los métodos
        // raros. Un gimnasio que cobra por MP no veía esa plata en ninguna parte del arqueo.
        @Test
        @DisplayName("Mercado Pago tiene su propia cuenta, no cae en 'otros'")
        void mercadoPagoSeReconoce() {
            hayPagos(pago("MERCADOPAGO", "paid", "30000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.mercadopago().compareTo(new BigDecimal("30000")));
            assertEquals(0, r.otros().signum(), "no puede estar contado dos veces");
        }
    }

    @Nested
    @DisplayName("el cierre diario")
    class ElCierre {

        /**
         * ⭐ EL CAMBIO DE 2026-09-02. Antes había que contar la plata y escribir el monto;
         * ahora el sistema ya sabe cuánto entró por cada forma de pago y lo único que
         * decide una persona es cuánto se lleva.
         */
        @Test
        @DisplayName("no hay que declarar nada: se cierra y el sistema pone los números")
        void cierraSinDeclarar() {
            hayPagos(pago("CASH", "paid", "50000"), pago("TRANSFER", "paid", "45000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals(0, c.getEsperadoEfectivo().compareTo(new BigDecimal("50000")));
            assertEquals(0, c.getEsperadoTransferencia().compareTo(new BigDecimal("45000")));
            assertEquals(2, c.getCantidadCobros());
        }

        @Test
        @DisplayName("lo que se retira sale del cajón, y el resto queda para mañana")
        void elRetiroDejaElResto() {
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(new BigDecimal("30000"), null, "Carla");

            assertEquals(0, c.getRetiroEfectivo().compareTo(new BigDecimal("30000")));
            assertEquals(0, c.getQuedaEnCaja().compareTo(new BigDecimal("20000")),
                    "50.000 cobrados menos 30.000 retirados");
        }

        @Test
        @DisplayName("sin retiro queda todo en el cajón")
        void sinRetiroQuedaTodo() {
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(null, null, "Carla");

            assertEquals(0, c.getRetiroEfectivo().compareTo(BigDecimal.ZERO));
            assertEquals(0, c.getQuedaEnCaja().compareTo(new BigDecimal("50000")));
        }

        /**
         * Un cero de más al tipear dejaría el fondo de mañana en negativo, y ese error
         * viajaría de día en día encadenado — porque el fondo de mañana es este número.
         */
        @Test
        @DisplayName("no se puede retirar más de lo que hay en el cajón")
        void noSePuedeRetirarDeMas() {
            hayPagos(pago("CASH", "paid", "50000"));

            var e = assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("500000"), null, "Carla"));

            assertTrue(e.getMessage().contains("retirar"));
            verify(cierres, never()).save(any());
        }

        @Test
        @DisplayName("tampoco un retiro negativo")
        void nadaDeRetirosNegativos() {
            hayPagos(pago("CASH", "paid", "50000"));

            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("-100"), null, "Carla"));
        }

        /**
         * La transferencia NO está en el cajón. Meterla en el efectivo disponible haría que
         * se pudiera "retirar" plata que está en el banco, y el cajón quedaría en negativo
         * de verdad aunque la cuenta diera bien.
         */
        @Test
        @DisplayName("⚠️ lo cobrado por transferencia no se puede retirar del cajón")
        void loDigitalNoEstaEnElCajon() {
            hayPagos(pago("CASH", "paid", "10000"), pago("TRANSFER", "paid", "90000"));

            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("100000"), null, "Carla"),
                    "los 90.000 de transferencia están en el banco, no en el cajón");
        }

        /**
         * Las columnas del arqueo viejo siguen existiendo porque los cierres históricos las
         * tienen cargadas. En los nuevos van en NULL, y no en cero: cero diría "cuadró
         * perfecto", que es una afirmación que nadie hizo.
         */
        @Test
        @DisplayName("sin conteo declarado no hay diferencia que informar")
        void sinArqueoNoHayDiferencia() {
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertFalse(c.isConArqueo());
            assertNull(c.getDeclaradoEfectivo());
            assertNull(c.getDiferencia());
            assertNull(c.getDiferenciaDigital());
        }

        @Test
        @DisplayName("el nombre de quien cerró queda congelado en el registro")
        void congelaElNombre() {
            hayPagos(pago("CASH", "paid", "1000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals("Carla", c.getCerradoPorNombre());
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

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals(finAnterior, c.getDesde(), "sin esto, un período contaría cobros ya cerrados");
        }

        @Test
        @DisplayName("el PRIMER cierre no arrastra toda la historia del gimnasio")
        void elPrimeroNoArrastraTodo() {
            // Un gimnasio que viene de migrar tiene meses de cobros importados. Si el primer
            // arqueo los tomara, daría un faltante enorme y sin sentido — la peor forma de
            // estrenar la función.
            hayPagos(pago("CASH", "paid", "1000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertTrue(c.getDesde().isAfter(LocalDateTime.now().minusDays(31)));
        }
    }

    /**
     * El fondo del cajón, que ya no lo declara nadie.
     *
     * <p>Antes había que ABRIR la caja a la mañana escribiendo el cambio que había quedado.
     * El día que alguien se olvidaba, el arqueo daba sobrante por ese monto — y peor: lo
     * cobrado antes de abrir no lo contaba nadie. Ahora el fondo de hoy es, por definición,
     * lo que el cierre de ayer decidió dejar en el cajón.</p>
     */
    @Nested
    @DisplayName("el fondo lo dice el cierre anterior")
    class ElFondo {

        private CajaCierre cierreAnterior(String quedaEnCaja) {
            CajaCierre anterior = new CajaCierre();
            anterior.setHasta(LocalDateTime.now().minusHours(10));
            if (quedaEnCaja != null) anterior.setQuedaEnCaja(new BigDecimal(quedaEnCaja));
            when(cierres.findTopByTenantIdOrderByHastaDesc(TENANT)).thenReturn(Optional.of(anterior));
            return anterior;
        }

        @Test
        @DisplayName("⭐ lo que quedó ayer en el cajón es el fondo de hoy")
        void loDeAyerEsElFondoDeHoy() {
            cierreAnterior("20000");

            assertEquals(0, service.fondoActual().compareTo(new BigDecimal("20000")));
        }

        @Test
        @DisplayName("el fondo entra en la cuenta del cajón, y por eso se puede retirar")
        void elFondoSeSumaAlCajon() {
            cierreAnterior("20000");
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(new BigDecimal("70000"), null, "Carla");

            assertEquals(0, c.getQuedaEnCaja().compareTo(BigDecimal.ZERO),
                    "20.000 de fondo + 50.000 cobrados, retirado todo");
            assertEquals(0, c.getFondoInicial().compareTo(new BigDecimal("20000")));
        }

        @Test
        @DisplayName("sin ningún cierre previo el fondo es cero, no un misterio")
        void sinCierresElFondoEsCero() {
            assertEquals(0, service.fondoActual().compareTo(BigDecimal.ZERO));
        }

        /**
         * La transición: los cierres anteriores al 2026-09-02 no tienen quedaEnCaja, así
         * que mientras el último sea uno de esos se respeta el fondo de la sesión abierta.
         * Sin esto, el primer cierre nuevo se comería el cambio que había en el cajón y
         * daría un sobrante por ese monto.
         */
        @Test
        @DisplayName("con un cierre viejo (sin el dato) se respeta la caja abierta del modelo anterior")
        void transicionDesdeElModeloViejo() {
            cierreAnterior(null);
            hayUnaAbierta("15000");

            assertEquals(0, service.fondoActual().compareTo(new BigDecimal("15000")));
        }

        @Test
        @DisplayName("si venía una caja abierta del modelo viejo, el cierre la cierra")
        void cierraLaSesionVieja() {
            var abierta = hayUnaAbierta("10000");
            hayPagos(pago("CASH", "paid", "1000"));

            service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertNotNull(abierta.getCerradaAt(), "dejarla abierta bloquearía el índice único para siempre");
        }
    }

    @Nested
    @DisplayName("lo que sale del cajón")
    class LosEgresos {

        private static final String EGRESO = com.veltronik.v2.gym.entities.CajaMovimiento.EGRESO;
        private static final String INGRESO = com.veltronik.v2.gym.entities.CajaMovimiento.INGRESO;
        private static final String EFECTIVO = com.veltronik.v2.gym.entities.CajaMovimiento.EFECTIVO;

        @Test
        @DisplayName("⭐ un gasto en efectivo BAJA lo que tiene que haber en el cajón")
        void elEgresoSeResta() {
            // El caso que rompía todos los días: se le pagan $15.000 a la limpieza y a la
            // noche el sistema espera esa plata igual. El cierre decía FALTANTE y acusaba a
            // quien atendió, que no había robado nada.
            hayUnaAbierta("10000");
            hayPagos(pago("CASH", "paid", "50000"));
            hayMovimientos(movimiento(EGRESO, EFECTIVO, "15000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.egresosEfectivo().compareTo(new BigDecimal("15000")));
            assertEquals(0, r.enElCajon(new BigDecimal("10000")).compareTo(new BigDecimal("45000")),
                    "fondo 10.000 + cobrado 50.000 - gastado 15.000 = 45.000");
        }

        @Test
        @DisplayName("con el gasto anotado, el cierre CUADRA en vez de acusar a quien atendió")
        void conElEgresoLaCajaCuadra() {
            hayUnaAbierta("10000");
            hayPagos(pago("CASH", "paid", "50000"));
            hayMovimientos(movimiento(EGRESO, EFECTIVO, "15000"));

            var c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals(0, c.getQuedaEnCaja().compareTo(new BigDecimal("45000")),
                    "60.000 cobrados menos 15.000 de gasto: eso es lo que queda para mañana");
            assertEquals(0, c.getEgresosEfectivo().compareTo(new BigDecimal("15000")),
                    "y el egreso queda CONGELADO en el cierre: sin él, el esperado de este día "
                            + "no se podría reconstruir mañana");
        }

        @Test
        @DisplayName("una entrada de plata que no es un cobro SUMA")
        void elIngresoManualSuma() {
            hayPagos(pago("CASH", "paid", "50000"));
            hayMovimientos(movimiento(INGRESO, EFECTIVO, "3000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.enElCajon(BigDecimal.ZERO).compareTo(new BigDecimal("53000")));
        }

        @Test
        @DisplayName("⚠️ un gasto por TRANSFERENCIA no toca el cajón")
        void loQueNoPasaPorElCajonNoCuenta() {
            // Se le paga al proveedor desde el banco: se anota porque el dueño quiere verlo,
            // pero el efectivo del cajón no se movió. Restarlo daría un faltante inventado.
            hayPagos(pago("CASH", "paid", "50000"));
            hayMovimientos(movimiento(EGRESO, "TRANSFER", "15000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.egresosEfectivo().compareTo(BigDecimal.ZERO));
            assertEquals(0, r.enElCajon(BigDecimal.ZERO).compareTo(new BigDecimal("50000")));
            assertEquals(1, r.cantidadMovimientos(), "pero se cuenta: el dueño tiene que verlo");
        }

        @Test
        @DisplayName("un movimiento anulado no mueve la cuenta")
        void elAnuladoNoCuenta() {
            hayPagos(pago("CASH", "paid", "50000"));
            var anulado = movimiento(EGRESO, EFECTIVO, "15000");
            anulado.setAnuladoAt(LocalDateTime.now());
            hayMovimientos(anulado);

            var r = service.resumenAbierto();

            assertEquals(0, r.enElCajon(BigDecimal.ZERO).compareTo(new BigDecimal("50000")));
        }

        @Test
        @DisplayName("⚠️ un egreso SIN detalle no se acepta: es lo único que lo hace verificable")
        void elEgresoNecesitaDetalle() {
            var e = assertThrows(ResponseStatusException.class,
                    () -> service.registrar(EGRESO, "PROVEEDOR", "  ", new BigDecimal("20000"), EFECTIVO, "Carla"));

            assertTrue(e.getMessage().toLowerCase().contains("gast"),
                    "el mensaje tiene que decir qué falta, no 'campo inválido'");
        }

        @Test
        @DisplayName("el monto lo pone el tipo, nunca el signo")
        void nadaDeMontosNegativos() {
            assertThrows(ResponseStatusException.class,
                    () -> service.registrar(EGRESO, "PROVEEDOR", "agua", new BigDecimal("-20000"), EFECTIVO, "Carla"));
            assertThrows(ResponseStatusException.class,
                    () -> service.registrar(EGRESO, "PROVEEDOR", "agua", BigDecimal.ZERO, EFECTIVO, "Carla"));
        }

        @Test
        @DisplayName("un tipo que no es ni ingreso ni egreso se rechaza")
        void tipoInvalido() {
            assertThrows(ResponseStatusException.class,
                    () -> service.registrar("CUALQUIERA", "PROVEEDOR", "agua", new BigDecimal("100"), EFECTIVO, "Carla"));
        }

        @Test
        @DisplayName("el ingreso NO necesita detalle: no es el que se puede inventar para robar")
        void elIngresoNoNecesitaDetalle() {
            var m = service.registrar(INGRESO, "VENTA", null, new BigDecimal("3000"), EFECTIVO, "Carla");

            assertEquals(INGRESO, m.getTipo());
            assertNull(m.getDetalle());
        }
    }
}
