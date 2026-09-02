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
    @DisplayName("el cierre")
    class ElCierre {

        // ⭐ El test que sostiene el módulo entero.
        @Test
        @DisplayName("RECEPCIÓN NO PUEDE cerrar sin contar la plata")
        void recepcionTieneQueContar() {
            hayPagos(pago("CASH", "paid", "50000"));

            var e = assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(null, null, null, "Carla", false));

            assertTrue(e.getMessage().contains("contar"));
            verify(cierres, never()).save(any());
        }

        @Test
        @DisplayName("el dueño SÍ puede cortar sin contar, y queda marcado")
        void elDuenoPuedeCortar() {
            // Puede estar cerrando el mes desde su casa, sin ningún cajón adelante. Mentir
            // que contó sería peor: el historial mostraría un arqueo que nunca existió.
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(null, null, null, "Hugo", true);

            assertFalse(c.isConArqueo());
            assertNull(c.getDeclaradoEfectivo());
            assertNull(c.getDiferencia(), "sin conteo no hay diferencia que informar");
        }

        @Test
        @DisplayName("cuando cuadra, la diferencia es cero")
        void cuadra() {
            hayPagos(pago("CASH", "paid", "50000"), pago("TRANSFER", "paid", "45000"));

            CajaCierre c = service.cerrar(new BigDecimal("50000"), BigDecimal.ZERO, null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum());
            assertTrue(c.isConArqueo());
        }

        @Test
        @DisplayName("si falta plata, la diferencia es NEGATIVA")
        void faltaPlata() {
            // El signo importa: la pantalla del dueño ordena por esto para encontrar los
            // faltantes, y un signo al revés convertiría un robo en un sobrante.
            hayPagos(pago("CASH", "paid", "50000"));

            CajaCierre c = service.cerrar(new BigDecimal("47500"), BigDecimal.ZERO, "di mal el vuelto", "Carla", false);

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

            CajaCierre c = service.cerrar(new BigDecimal("50000"), BigDecimal.ZERO, null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum());
            assertEquals(0, c.getEsperadoTransferencia().compareTo(new BigDecimal("200000")),
                    "pero sí se guarda, para conciliar contra el banco");
        }


        // ⭐ EL FRAUDE QUE ESTO CIERRA
        //
        // Quien atiende cobra $48.000 en efectivo, se guarda la plata, y registra el cobro
        // como "transferencia". El cajón cuadra PERFECTO —el sistema no espera ese
        // efectivo— y la transferencia que el sistema da por recibida nunca existió.
        // Contando solo el cajón, esto no lo detecta nadie, nunca.
        @Test
        @DisplayName("cobrar en efectivo y anotarlo como transferencia queda a la vista")
        void elEfectivoDisfrazadoDeTransferencia() {
            hayPagos(pago("TRANSFER", "paid", "48000"));

            // Cuenta el cajón: no hay efectivo, y el sistema tampoco lo espera. Cuadra.
            // Después mira el banco: no entró nada.
            CajaCierre c = service.cerrar(BigDecimal.ZERO, BigDecimal.ZERO, null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum(), "el cajón cuadra: por eso no alcanzaba");
            assertEquals(0, c.getDiferenciaDigital().compareTo(new BigDecimal("-48000")),
                    "pero el banco dice que esa transferencia no existió");
        }

        @Test
        @DisplayName("transferencias y Mercado Pago se cuentan juntos")
        void loDigitalVaJunto() {
            // Quien cuenta abre la app y mira cuánto entró. Es un solo gesto: pedirle dos
            // números para la misma revisión es friccion sin nada a cambio.
            hayPagos(pago("TRANSFER", "paid", "30000"), pago("MERCADOPAGO", "paid", "20000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, new BigDecimal("50000"), null, "Carla", false);

            assertEquals(0, c.getDiferenciaDigital().signum());
        }

        @Test
        @DisplayName("RECEPCIÓN tampoco puede cerrar sin contar lo digital")
        void hayQueContarLoDigital() {
            // Si se pudiera saltear, el agujero vuelve a estar abierto: alcanzaría con no
            // declarar nunca las transferencias.
            hayPagos(pago("CASH", "paid", "50000"));

            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("50000"), null, null, "Carla", false));
        }

        @Test
        @DisplayName("el dueño que corta sin contar no declara ninguna de las dos")
        void elCorteDelDuenoNoDeclaraNada() {
            hayPagos(pago("CASH", "paid", "50000"), pago("TRANSFER", "paid", "20000"));

            CajaCierre c = service.cerrar(null, null, null, "Dueño", true);

            assertNull(c.getDiferencia());
            assertNull(c.getDiferenciaDigital(), "no se contó: no puede figurar como que cuadró");
        }

        @Test
        @DisplayName("tampoco se acepta un digital negativo")
        void nadaDeDigitalNegativo() {
            hayPagos(pago("CASH", "paid", "50000"));
            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(BigDecimal.ZERO, new BigDecimal("-1"), null, "Carla", false));
        }

        @Test
        @DisplayName("si entró MÁS plata de la registrada, la diferencia es positiva")
        void entroDeMas() {
            // Pasa cuando alguien transfiere y el cobro no se cargó. No es robo, pero es
            // plata sin dueño: hay que buscar de quién fue.
            hayPagos(pago("TRANSFER", "paid", "30000"));

            CajaCierre c = service.cerrar(BigDecimal.ZERO, new BigDecimal("48000"), null, "Carla", false);

            assertEquals(0, c.getDiferenciaDigital().compareTo(new BigDecimal("18000")));
        }

        @Test
        @DisplayName("no se acepta un efectivo negativo")
        void nadaDeNegativos() {
            hayPagos(pago("CASH", "paid", "50000"));
            assertThrows(ResponseStatusException.class,
                    () -> service.cerrar(new BigDecimal("-1"), BigDecimal.ZERO, null, "Carla", false));
        }

        @Test
        @DisplayName("el nombre de quien cerró queda congelado en el registro")
        void congelaElNombre() {
            // El id del cajero ya viaja aparte, pero si mañana ese empleado se da de baja el
            // cierre tiene que seguir diciendo quién lo hizo: sin nombres no hay patrón por
            // persona, que es para lo que existe el historial.
            hayPagos(pago("CASH", "paid", "1000"));
            assertEquals("Carla", service.cerrar(new BigDecimal("1000"), BigDecimal.ZERO, null, "Carla", false).getCerradoPorNombre());
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

            CajaCierre c = service.cerrar(new BigDecimal("1000"), BigDecimal.ZERO, null, "Carla", false);

            assertEquals(finAnterior, c.getDesde(), "sin esto, un período contaría cobros ya arqueados");
        }

        @Test
        @DisplayName("el PRIMER cierre no arrastra toda la historia del gimnasio")
        void elPrimeroNoArrastraTodo() {
            // Un gimnasio que viene de migrar tiene meses de cobros importados. Si el primer
            // arqueo los tomara, daría un faltante enorme y sin sentido — la peor forma de
            // estrenar la función.
            hayPagos(pago("CASH", "paid", "1000"));

            CajaCierre c = service.cerrar(new BigDecimal("1000"), BigDecimal.ZERO, null, "Carla", false);

            assertTrue(c.getDesde().isAfter(LocalDateTime.now().minusDays(31)));
        }
    }

    @Nested
    @DisplayName("abrir y cerrar la caja")
    class AbrirYCerrar {

        @Test
        @DisplayName("abrir deja la caja abierta, con quién y con cuánto cambio")
        void abrir() {
            var s = service.abrir(new BigDecimal("10000"), "Carla");

            assertTrue(s.estaAbierta());
            assertEquals("Carla", s.getAbiertaPorNombre());
            assertEquals(0, s.getFondoInicial().compareTo(new BigDecimal("10000")));
        }

        // ⭐ DOS CAJAS ABIERTAS = LA PLATA CONTADA DOS VECES O NINGUNA.
        // El gimnasio puede tener la notebook con la web y la PC del mostrador con el
        // escritorio. La base lo impide con un índice único; acá se avisa con un mensaje
        // entendible en vez de dejar que explote una violación de constraint.
        @Test
        @DisplayName("no se puede abrir una caja si ya hay una abierta")
        void unaSola() {
            hayUnaAbierta("10000");

            assertThrows(ResponseStatusException.class,
                    () -> service.abrir(new BigDecimal("5000"), "Otro"));
        }

        // ⭐ EL FONDO: POR QUÉ EL ARQUEO NUNCA CUADRABA
        //
        // El cajón arranca el día con el cambio de ayer. Si el sistema espera solo lo
        // cobrado hoy, ese cambio aparece como sobrante TODOS los días, y un arqueo que
        // siempre da sobrante es un arqueo que nadie mira.
        @Test
        @DisplayName("el cambio con el que se abrió cuenta como esperado")
        void elFondoCuenta() {
            hayUnaAbierta("10000");
            hayPagos(pago("CASH", "paid", "45000"));

            // En el cajón hay el cambio de ayer más lo cobrado hoy.
            CajaCierre c = service.cerrar(new BigDecimal("55000"), BigDecimal.ZERO, null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum(), "sin el fondo, esto daría +10.000 todos los días");
            assertEquals(0, c.getFondoInicial().compareTo(new BigDecimal("10000")),
                    "el fondo queda grabado: sin él, el esperado de un cierre viejo no se reconstruye");
        }

        @Test
        @DisplayName("cerrar la caja cierra también la sesión abierta")
        void cerrarCierraLaSesion() {
            var s = hayUnaAbierta("0");
            hayPagos(pago("CASH", "paid", "1000"));

            CajaCierre c = service.cerrar(new BigDecimal("1000"), BigDecimal.ZERO, null, "Carla", false);

            assertFalse(s.estaAbierta(), "quedaría abierta para siempre y no se podría abrir otra");
            assertEquals(c.getId(), s.getCierreId());
        }

        @Test
        @DisplayName("sin caja abierta se puede cerrar igual, con fondo cero")
        void sinSesionSeCierraIgual() {
            // Nadie abrió la caja pero se cobró igual. Esa plata NO puede quedar sin contar:
            // el período sigue siendo continuo desde el último cierre.
            hayPagos(pago("CASH", "paid", "45000"));

            CajaCierre c = service.cerrar(new BigDecimal("45000"), BigDecimal.ZERO, null, "Carla", false);

            assertEquals(0, c.getDiferencia().signum());
            assertEquals(0, c.getFondoInicial().signum());
        }

        @Test
        @DisplayName("no se acepta un fondo negativo")
        void fondoNegativo() {
            assertThrows(ResponseStatusException.class,
                    () -> service.abrir(new BigDecimal("-1"), "Carla"));
        }

        @Test
        @DisplayName("el período arranca cuando se abrió la caja")
        void elPeriodoArrancaAlAbrir() {
            var s = hayUnaAbierta("0");

            assertEquals(s.getAbiertaAt(), service.inicioDelPeriodoPublico());
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

            var c = service.cerrar(new BigDecimal("45000"), BigDecimal.ZERO, null, "Carla", false);

            assertEquals(0, c.getDiferencia().compareTo(BigDecimal.ZERO), "cuadra exacto");
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
