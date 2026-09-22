package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.repositories.CajaCierreRepository;
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
    private com.veltronik.v2.gym.repositories.CajaSesionRepository sesiones;
    private com.veltronik.v2.gym.repositories.CajaMovimientoRepository movimientos;
    private com.veltronik.v2.gym.repositories.CajaCierreAjusteRepository correcciones;
    private ContadorDeCaja contador;
    private CajaService service;

    /** Lo que el contador "lee" de la base en cada test. Lo arman hayPagos, hayMovimientos y hayCorrecciones. */
    private final List<ContadorDeCaja.Cobro> cobrosSinSellar = new java.util.ArrayList<>();
    private final List<ContadorDeCaja.Movimiento> movimientosSinSellar = new java.util.ArrayList<>();
    private final List<ContadorDeCaja.Correccion> corregidos = new java.util.ArrayList<>();

    @BeforeEach
    void setUp() {
        cierres = mock(CajaCierreRepository.class);
        sesiones = mock(com.veltronik.v2.gym.repositories.CajaSesionRepository.class);
        movimientos = mock(com.veltronik.v2.gym.repositories.CajaMovimientoRepository.class);
        correcciones = mock(com.veltronik.v2.gym.repositories.CajaCierreAjusteRepository.class);
        contador = mock(ContadorDeCaja.class);
        // El rastro de ajustes y el libro de ingresos se simulan: acá se prueba el arqueo.
        service = new CajaService(cierres,
                mock(com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository.class), sesiones, movimientos,
                correcciones, contador, mock(LibroDeIngresos.class));
        when(sesiones.save(any(com.veltronik.v2.gym.entities.CajaSesion.class))).thenAnswer(i -> i.getArgument(0));
        when(sesiones.findByTenantIdAndCerradaAtIsNull(TENANT)).thenReturn(Optional.empty());
        when(movimientos.save(any(com.veltronik.v2.gym.entities.CajaMovimiento.class)))
                .thenAnswer(i -> i.getArgument(0));
        TenantContextHolder.setTenantId(TENANT);
        when(cierres.saveAndFlush(any(CajaCierre.class))).thenAnswer(i -> {
            CajaCierre c = i.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });
        when(cierres.findTopByTenantIdOrderByHastaDesc(TENANT)).thenReturn(Optional.empty());

        // ⚠️ El contador es la base: la lectura (lo que filtra el WHERE) y el sello los prueban
        // CadaPesoEnUnSoloCierreIntegrationTest y CierreSinInternetIntegrationTest contra Postgres.
        // Acá se simula para probar la CUENTA: qué suma, qué resta y qué queda en el cajón.
        when(contador.leer(eq(TENANT), any(), any(), anyBoolean())).thenAnswer(i -> new ContadorDeCaja.PorCerrar(
                List.copyOf(cobrosSinSellar), List.copyOf(corregidos), List.copyOf(movimientosSinSellar)));
        when(contador.sellarCobros(eq(TENANT), any(), any(), any())).thenAnswer(i -> ((List<?>) i.getArgument(1)).size());
        when(contador.sellarMovimientos(eq(TENANT), any(), any(), any())).thenAnswer(i -> ((List<?>) i.getArgument(1)).size());
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
        for (var m : lista) {
            movimientosSinSellar.add(new ContadorDeCaja.Movimiento(UUID.randomUUID(), m.getTipo(), m.getCategoria(),
                    m.getMetodo(), m.getMonto(), m.estaVigente()));
        }
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

    /** Un cobro sin sellar, como lo devuelve la base: ya cobrado (el WHERE deja afuera lo demás). */
    private ContadorDeCaja.Cobro pago(String metodo, String monto) {
        return new ContadorDeCaja.Cobro(UUID.randomUUID(), LocalDateTime.now().minusHours(1),
                new BigDecimal(monto), metodo, "Socio");
    }

    private void hayPagos(ContadorDeCaja.Cobro... lista) {
        cobrosSinSellar.addAll(List.of(lista));
    }

    /** Un cobro YA CERRADO que hoy vale otra cosa: lo que contó su cierre, y lo de ahora. */
    private void hayCorreccion(String metodoAntes, String montoAntes, String metodoDespues, String montoDespues) {
        corregidos.add(new ContadorDeCaja.Correccion(UUID.randomUUID(), LocalDateTime.now().minusDays(1), "Socio",
                metodoAntes, new BigDecimal(montoAntes), metodoDespues, new BigDecimal(montoDespues)));
    }

    @Nested
    @DisplayName("lo que cuenta el sistema")
    class LoQueCuenta {

        @Test
        @DisplayName("separa efectivo, transferencia y tarjeta")
        void separaPorMetodo() {
            hayPagos(pago("CASH", "48000"), pago("TRANSFER", "45000"),
                    pago("CARD", "10000"), pago("CASH", "2000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.efectivo().compareTo(new BigDecimal("50000")));
            assertEquals(0, r.transferencia().compareTo(new BigDecimal("45000")));
            assertEquals(0, r.tarjeta().compareTo(new BigDecimal("10000")));
            assertEquals(4, r.cantidadCobros());
        }

        // ("Un pago pendiente NO cuenta" lo prueba CadaPesoEnUnSoloCierreIntegrationTest: lo deja
        // afuera el WHERE del contador, que acá está simulado.)

        @Test
        @DisplayName("un método raro cae en 'otros' en vez de perderse")
        void metodoDesconocido() {
            hayPagos(pago("CHEQUE", "30000"));
            assertEquals(0, service.resumenAbierto().otros().compareTo(new BigDecimal("30000")));
        }

        // ⭐ EL BUG: Mercado Pago es una de las cuatro opciones que ofrece el sistema al
        // cobrar, pero el cierre no lo reconocía y lo mandaba a "otros" con los métodos
        // raros. Un gimnasio que cobra por MP no veía esa plata en ninguna parte del arqueo.
        @Test
        @DisplayName("Mercado Pago tiene su propia cuenta, no cae en 'otros'")
        void mercadoPagoSeReconoce() {
            hayPagos(pago("MERCADOPAGO", "30000"));

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
            hayPagos(pago("CASH", "50000"), pago("TRANSFER", "45000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals(0, c.getEsperadoEfectivo().compareTo(new BigDecimal("50000")));
            assertEquals(0, c.getEsperadoTransferencia().compareTo(new BigDecimal("45000")));
            assertEquals(2, c.getCantidadCobros());
        }

        @Test
        @DisplayName("lo que se retira sale del cajón, y el resto queda para mañana")
        void elRetiroDejaElResto() {
            hayPagos(pago("CASH", "50000"));

            CajaCierre c = service.cerrar(new BigDecimal("30000"), null, "Carla");

            assertEquals(0, c.getRetiroEfectivo().compareTo(new BigDecimal("30000")));
            assertEquals(0, c.getQuedaEnCaja().compareTo(new BigDecimal("20000")),
                    "50.000 cobrados menos 30.000 retirados");
        }

        @Test
        @DisplayName("sin retiro queda todo en el cajón")
        void sinRetiroQuedaTodo() {
            hayPagos(pago("CASH", "50000"));

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
            hayPagos(pago("CASH", "50000"));

            var e = assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("500000"), null, "Carla"));

            assertTrue(e.getMessage().contains("retirar"));
            verify(cierres, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("tampoco un retiro negativo")
        void nadaDeRetirosNegativos() {
            hayPagos(pago("CASH", "50000"));

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
            hayPagos(pago("CASH", "10000"), pago("TRANSFER", "90000"));

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
            hayPagos(pago("CASH", "50000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertFalse(c.isConArqueo());
            assertNull(c.getDeclaradoEfectivo());
            assertNull(c.getDiferencia());
            assertNull(c.getDiferenciaDigital());
        }

        @Test
        @DisplayName("el nombre de quien cerró queda congelado en el registro")
        void congelaElNombre() {
            hayPagos(pago("CASH", "1000"));

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
            hayPagos(pago("CASH", "1000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals(finAnterior, c.getDesde(), "sin esto, un período contaría cobros ya cerrados");
        }

        @Test
        @DisplayName("el PRIMER cierre no arrastra toda la historia del gimnasio")
        void elPrimeroNoArrastraTodo() {
            // Un gimnasio que viene de migrar tiene meses de cobros importados. Si el primer
            // arqueo los tomara, daría un faltante enorme y sin sentido — la peor forma de
            // estrenar la función.
            hayPagos(pago("CASH", "1000"));

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
            hayPagos(pago("CASH", "50000"));

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
            hayPagos(pago("CASH", "1000"));

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
            hayPagos(pago("CASH", "50000"));
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
            hayPagos(pago("CASH", "50000"));
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
            hayPagos(pago("CASH", "50000"));
            hayMovimientos(movimiento(INGRESO, EFECTIVO, "3000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.enElCajon(BigDecimal.ZERO).compareTo(new BigDecimal("53000")));
        }

        @Test
        @DisplayName("⚠️ un gasto por TRANSFERENCIA no toca el cajón")
        void loQueNoPasaPorElCajonNoCuenta() {
            // Se le paga al proveedor desde el banco: se anota porque el dueño quiere verlo,
            // pero el efectivo del cajón no se movió. Restarlo daría un faltante inventado.
            hayPagos(pago("CASH", "50000"));
            hayMovimientos(movimiento(EGRESO, "TRANSFER", "15000"));

            var r = service.resumenAbierto();

            assertEquals(0, r.egresosEfectivo().compareTo(BigDecimal.ZERO));
            assertEquals(0, r.enElCajon(BigDecimal.ZERO).compareTo(new BigDecimal("50000")));
            assertEquals(1, r.cantidadMovimientos(), "pero se cuenta: el dueño tiene que verlo");
        }

        @Test
        @DisplayName("un movimiento anulado no mueve la cuenta")
        void elAnuladoNoCuenta() {
            hayPagos(pago("CASH", "50000"));
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

    /**
     * ⭐ Un cobro de un día YA CERRADO que se corrige o se anula (V88).
     *
     * <p>Hasta el 2026-09-22 esa diferencia no entraba en ningún cierre: el de ayer quedaba
     * congelado con el número viejo, y el de hoy no la veía. Ahora el cierre de hoy la toma como
     * corrección, a la vista, del lado de la forma de pago en que está cada peso.</p>
     */
    @Nested
    @DisplayName("las correcciones de días ya cerrados")
    class LasCorrecciones {

        @Test
        @DisplayName("⭐ un cobro en efectivo de ayer anulado hoy (se devolvió la plata) BAJA el cajón de hoy")
        void laAnulacionSaleDelCajon() {
            hayPagos(pago("CASH", "50000"));
            hayCorreccion("CASH", "30000", "CASH", "0");

            var r = service.resumenAbierto();

            assertEquals(0, r.ajustesEfectivo().compareTo(new BigDecimal("-30000")));
            assertEquals(0, r.enElCajon(BigDecimal.ZERO).compareTo(new BigDecimal("20000")),
                    "50.000 de hoy menos los 30.000 que se devolvieron");
            assertEquals(1, r.cantidadAjustes());
            assertEquals(0, r.efectivo().compareTo(new BigDecimal("50000")),
                    "lo cobrado HOY sigue diciendo lo de hoy: la corrección va en su propio renglón");
        }

        @Test
        @DisplayName("pasar un cobro de efectivo a transferencia saca la plata del cajón y la pone en el banco")
        void cambiarLaFormaDePagoMueveLaPlataDeLado() {
            hayCorreccion("CASH", "10000", "TRANSFER", "10000");

            var r = service.resumenAbierto();

            assertEquals(0, r.ajustesEfectivo().compareTo(new BigDecimal("-10000")));
            assertEquals(0, r.ajustesOtrosMedios().compareTo(new BigDecimal("10000")));
        }

        @Test
        @DisplayName("bajar el monto de un cobro ya cerrado deja la diferencia a la vista")
        void bajarElMonto() {
            hayCorreccion("CASH", "48000", "CASH", "40000");

            assertEquals(0, service.resumenAbierto().ajustesEfectivo().compareTo(new BigDecimal("-8000")));
        }

        @Test
        @DisplayName("el cierre congela la corrección, guarda el detalle y re-sella el cobro con el valor nuevo")
        void elCierreLaCongela() {
            hayPagos(pago("CASH", "50000"));
            hayCorreccion("CASH", "30000", "CASH", "0");

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            assertEquals(0, c.getAjustesEfectivo().compareTo(new BigDecimal("-30000")));
            assertEquals(1, c.getCantidadAjustes());
            assertEquals(0, c.getQuedaEnCaja().compareTo(new BigDecimal("20000")));
            verify(correcciones).save(any(com.veltronik.v2.gym.entities.CajaCierreAjuste.class));
            verify(contador).resellar(any(), eq(new BigDecimal("0")), eq("CASH"), any());
        }

        @Test
        @DisplayName("no se puede retirar la plata que se devolvió")
        void noSeRetiraLoDevuelto() {
            hayPagos(pago("CASH", "50000"));
            hayCorreccion("CASH", "30000", "CASH", "0");

            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("50000"), null, "Carla"),
                    "en el cajón quedan 20.000, no 50.000");
        }
    }

    @Nested
    @DisplayName("el sello")
    class ElSello {

        @Test
        @DisplayName("⭐ el cierre sella exactamente lo que contó")
        void sellaLoQueConto() {
            var a = pago("CASH", "50000");
            var b = pago("TRANSFER", "20000");
            hayPagos(a, b);

            CajaCierre c = service.cerrar(BigDecimal.ZERO, null, "Carla");

            verify(contador).sellarCobros(eq(TENANT), eq(List.of(a.id(), b.id())), eq(c.getId()), any());
            verify(contador).candado(TENANT);
        }

        @Test
        @DisplayName("si no pudo sellar todo lo que leyó, el cierre NO se guarda")
        void sinSelloNoHayCierre() {
            hayPagos(pago("CASH", "50000"), pago("CASH", "1000"));
            when(contador.sellarCobros(eq(TENANT), any(), any(), any())).thenReturn(1);

            assertThrows(IllegalStateException.class, () -> service.cerrar(BigDecimal.ZERO, null, "Carla"),
                    "un cierre que dice 51.000 habiendo sellado uno solo contaría el otro dos veces");
        }
    }
}
