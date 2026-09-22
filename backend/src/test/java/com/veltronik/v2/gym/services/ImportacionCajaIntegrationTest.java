package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.DashboardResumenDTO;
import com.veltronik.v2.gym.dto.ImportacionCaja.Accion;
import com.veltronik.v2.gym.dto.ImportacionCaja.Analisis;
import com.veltronik.v2.gym.dto.ImportacionCaja.Fila;
import com.veltronik.v2.gym.dto.ImportacionCaja.Mes;
import com.veltronik.v2.gym.dto.ImportacionCaja.Pedido;
import com.veltronik.v2.gym.dto.ImportacionCaja.Resultado;
import com.veltronik.v2.gym.dto.ImportacionCaja.Ultima;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El historial de caja importado, contra Postgres real (ADR-014).
 *
 * <p>Los que llevan ⭐ son las tres promesas de la regla: lo importado <b>suma en los
 * ingresos</b>, <b>no mueve ningún vencimiento</b> y <b>no entra a la caja</b>. Cada una se
 * rompió de verdad alguna vez con otro nombre: el 31/08 los pagos importados revivieron
 * ex-socios, y el primer cierre de un gimnasio mira 30 días para atrás.</p>
 */
@DisplayName("Importar el historial de caja")
class ImportacionCajaIntegrationTest extends EmbeddedPostgresTest {

    @Autowired private ImportacionCajaService importador;
    @Autowired private ImportacionSociosService importadorDeSocios;
    @Autowired private GymDashboardService tablero;
    @Autowired private CajaService caja;
    @Autowired private GymPaymentService cobros;
    @Autowired private JdbcTemplate jdbc;

    private static final ZoneId RELOJ = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final DateTimeFormatter DMA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");

    private UUID gym;

    @BeforeEach
    void unGimnasioNuevo() {
        gym = crearGimnasio();
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    @Nested
    @DisplayName("la regla: suma en los ingresos, no toca vencimientos, no entra a la caja")
    class LaRegla {

        @Test
        @DisplayName("⭐ no le mueve el vencimiento a nadie ni reactiva a un dado de baja")
        void noTocaVencimientos() {
            LocalDateTime vencio = LocalDateTime.of(2026, 3, 10, 23, 59, 59);
            UUID vencido = crearSocio(gym, "Ana", "30111222", vencio, true);
            UUID deBaja = crearSocio(gym, "Beto", "31222333", vencio, false);

            importador.importar(pedido(
                    cobro(2, "05/03/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000"),
                    cobro(3, "10/03/2026", "09:00", "BETO", "31222333", "Cuota", "Mercado Pago", "34000")));

            assertThat(socio(vencido).get("membership_end")).isEqualTo(Timestamp.valueOf(vencio));
            assertThat(socio(vencido).get("is_active")).isEqualTo(true);
            assertThat(socio(deBaja).get("membership_end")).isEqualTo(Timestamp.valueOf(vencio));
            assertThat(socio(deBaja).get("is_active")).as("un pago viejo no revive a nadie").isEqualTo(false);

            // Atados a su socio, y sin período: no cubren nada.
            List<Map<String, Object>> filas = jdbc.queryForList(
                    "SELECT member_id, period_start, period_end, import_id FROM gym_payment WHERE tenant_id = ?", gym);
            assertThat(filas).hasSize(2).allSatisfy(f -> {
                assertThat(f.get("member_id")).isNotNull();
                assertThat(f.get("period_start")).isNull();
                assertThat(f.get("period_end")).isNull();
                assertThat(f.get("import_id")).isNotNull();
            });
        }

        @Test
        @DisplayName("⭐ el tablero lo suma mes por mes, y los gastos no son ingresos")
        void elTableroLoSuma() {
            importador.importar(pedido(
                    cobro(2, "05/01/2026", "07:17", "PEREYRA LUCIA", "33444555", "Cuota", "Transferencia", "29000"),
                    cobro(3, "20/01/2026", "18:00", "", "", "Pase por día", "Efectivo", "11000"),
                    cobro(4, "13/02/2026", "10:00", "ROJAS MARTA", "29888777", "Inscripción", "Mercado Pago", "29000"),
                    cobro(5, "13/02/2026", "18:03", "", "", "Gasto", "Efectivo", "-3500")));

            DashboardResumenDTO r = tablero.getResumen();

            assertThat(delMes(r, "2026-01")).isEqualByComparingTo("40000");
            assertThat(delMes(r, "2026-02")).as("el gasto de $3.500 no resta ni suma").isEqualByComparingTo("29000");
        }

        @Test
        @DisplayName("⭐ el primer cierre de caja no se lleva el historial como plata del día")
        void laCajaNoLoCuenta() {
            // El primer cierre de un gimnasio mira 30 días para atrás: justo donde cae la
            // última semana de ControlFit.
            LocalDateTime ayer = LocalDateTime.now(RELOJ).minusDays(1);
            importador.importar(pedido(
                    cobro(2, ayer.format(DMA), ayer.format(HM), "Ana", "30111222", "Cuota", "Efectivo", "34000"),
                    cobro(3, ayer.format(DMA), ayer.format(HM), "Beto", "31222333", "Cuota", "Transferencia", "32000"),
                    cobro(4, ayer.format(DMA), ayer.format(HM), "", "", "Gasto", "Efectivo", "-5000")));
            // Y uno cobrado de verdad en Veltronik, hoy.
            // A la hora exacta: un minuto antes, a las 00:00 del día 1, caería en el mes anterior.
            cobrarEnVeltronik(null, "20000", "cash", LocalDateTime.now(RELOJ));

            CajaService.Resumen abierto = caja.resumenAbierto();
            assertThat(abierto.efectivo()).isEqualByComparingTo("20000");
            assertThat(abierto.transferencia()).isEqualByComparingTo("0");
            assertThat(abierto.cantidadCobros()).isEqualTo(1);
            assertThat(abierto.egresosEfectivo()).as("el gasto importado no salió de este cajón").isEqualByComparingTo("0");
            assertThat(caja.movimientosDelPeriodo()).hasSize(1);
            assertThat(caja.movimientosDeCaja()).isEmpty();
            assertThat(caja.balance(true).efectivo()).isEqualByComparingTo("20000");

            var cierre = caja.cerrar(BigDecimal.ZERO, null, "Carla");
            assertThat(cierre.getCantidadCobros()).isEqualTo(1);
            assertThat(cierre.getEsperadoTransferencia()).isEqualByComparingTo("0");
            assertThat(cierre.getEgresosEfectivo()).isEqualByComparingTo("0");
        }

        @Test
        @DisplayName("⭐ editar un cobro importado no le da un mes al socio")
        void editarNoLoConvierteEnCobro() {
            LocalDateTime vencio = LocalDateTime.of(2026, 3, 10, 23, 59, 59);
            UUID ana = crearSocio(gym, "Ana", "30111222", vencio, true);
            importador.importar(pedido(cobro(2, "05/03/2026", "08:00", "Ana", "30111222", "Cuota", "Efectivo", "34000")));

            UUID id = jdbc.queryForObject("SELECT id FROM gym_payment WHERE tenant_id = ?", UUID.class, gym);
            GymPayment p = cobros.findByIdAndVerifyOwnership(id);
            p.setAmount(new BigDecimal("32000"));
            p.setPeriodEnd(LocalDateTime.now(RELOJ).plusMonths(1)); // lo que mandaría una pantalla distraída
            cobros.saveForCurrentTenant(p);

            assertThat(socio(ana).get("membership_end")).isEqualTo(Timestamp.valueOf(vencio));
            Map<String, Object> editado = jdbc.queryForMap("SELECT amount, period_end, import_id FROM gym_payment WHERE id = ?", id);
            assertThat((BigDecimal) editado.get("amount")).isEqualByComparingTo("32000");
            assertThat(editado.get("period_end")).isNull();
            assertThat(editado.get("import_id")).as("sigue siendo historia").isNotNull();
        }

        @Test
        @DisplayName("la base no deja escribir un cobro importado con período")
        void laBaseLoExige() {
            importador.importar(pedido(cobro(2, "05/03/2026", "08:00", "Ana", "", "Cuota", "Efectivo", "34000")));
            assertThatThrownBy(() -> jdbc.update("UPDATE gym_payment SET period_end = now() WHERE tenant_id = ?", gym))
                    .hasMessageContaining("ck_gym_payment_importado_sin_periodo");
        }

        @Test
        @DisplayName("los \"pagó y figura vencido\" no lo miran")
        void laRevisionDeCoberturaNoLoMira() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 3, 10, 23, 59, 59), true);
            importador.importar(pedido(cobro(2, "05/09/2026", "08:00", "Ana", "30111222", "Cuota", "Efectivo", "34000")));
            assertThat(cobros.findCoverageGaps()).isEmpty();
        }
    }

    @Nested
    @DisplayName("quién pagó")
    class QuienPago {

        @Test
        @DisplayName("se ata al socio por DNI, con la misma vara que el check-in")
        void porDni() {
            UUID ana = crearSocio(gym, "Ana Gómez", "30111222", null, true);
            Resultado r = importador.importar(pedido(
                    cobro(2, "05/03/2026", "08:00", "GOMEZ ANA", "30.111.222", "Cuota", "Efectivo", "34000")));

            assertThat(r.cobros()).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT member_id FROM gym_payment WHERE tenant_id = ?", UUID.class, gym))
                    .isEqualTo(ana);
            assertThat(jdbc.queryForObject("SELECT notes FROM gym_payment WHERE tenant_id = ?", String.class, gym))
                    .isEqualTo("Cuota");
        }

        @Test
        @DisplayName("el ex-socio entra sin socio, con el nombre y el DNI en la nota, y cuenta igual")
        void exSocio() {
            Analisis a = importador.analizar(pedido(
                    cobro(2, "05/01/2026", "07:17", "PEREYRA LUCIA", "33444555", "Cuota", "Transferencia", "29000"),
                    cobro(3, "05/01/2026", "09:00", "PEREZ JUAN", "", "Cuota", "Efectivo", "29000"),
                    cobro(4, "05/01/2026", "10:00", "", "", "Pase por día", "Efectivo", "11000")));
            assertThat(a.sinSocio()).isEqualTo(3);
            assertThat(a.avisosGenerales()).hasSize(3);

            importador.importar(pedido(
                    cobro(2, "05/01/2026", "07:17", "PEREYRA LUCIA", "33444555", "Cuota", "Transferencia", "29000")));

            Map<String, Object> p = jdbc.queryForMap("SELECT member_id, notes, payment_method, payment_date FROM gym_payment WHERE tenant_id = ?", gym);
            assertThat(p.get("member_id")).isNull();
            assertThat(p.get("notes")).isEqualTo("PEREYRA LUCIA (DNI 33444555) · Cuota");
            assertThat(p.get("payment_method")).isEqualTo("transfer");
            assertThat(p.get("payment_date")).isEqualTo(Timestamp.valueOf(LocalDateTime.of(2026, 1, 5, 7, 17)));
            assertThat(cuantosSocios()).as("no se da de alta a nadie").isZero();
        }

        @Test
        @DisplayName("⭐ lo que ya se cobró en Veltronik no se cuenta dos veces")
        void yaCobrado() {
            UUID tito = crearSocio(gym, "Tito", "40111222", null, true);
            // El mismo instante para los dos: con "un minuto antes", a las 00:00 el archivo
            // caería en el día anterior y el test fallaría solo de madrugada.
            LocalDateTime hoy = LocalDateTime.now(RELOJ).withSecond(0).withNano(0);
            cobrarEnVeltronik(tito, "34000", "cash", hoy);

            Analisis a = importador.analizar(pedido(
                    cobro(2, hoy.format(DMA), hoy.format(HM), "TITO", "40111222", "Cuota", "Efectivo", "34000")));

            assertThat(a.yaCobrados()).isEqualTo(1);
            assertThat(a.cobros()).isZero();
            assertThat(a.filas().get(0).accion()).isEqualTo(Accion.YA_COBRADO);
        }
    }

    @Nested
    @DisplayName("los gastos")
    class Gastos {

        @Test
        @DisplayName("van a los egresos, con el detalle limpio, y no entran al arqueo")
        void alosEgresos() {
            Resultado r = importador.importar(pedido(new Fila(2, "13/02/2026", "18:03", "", "", "Gasto", "Efectivo",
                    "-3500", "", "Gasto: Gasto: yerba")));

            assertThat(r.gastos()).isEqualTo(1);
            assertThat(r.cobros()).isZero();
            assertThat(cuantosCobros()).isZero();
            Map<String, Object> m = jdbc.queryForMap("SELECT * FROM caja_movimiento WHERE tenant_id = ?", gym);
            assertThat(m.get("tipo")).isEqualTo("EGRESO");
            assertThat((BigDecimal) m.get("monto")).isEqualByComparingTo("3500");
            assertThat(m.get("detalle")).isEqualTo("yerba");
            assertThat(m.get("metodo")).isEqualTo("CASH");
            assertThat(m.get("import_id")).isNotNull();

            UUID id = (UUID) m.get("id");
            assertThatThrownBy(() -> caja.anular(id, "no va", "Carla"))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("historial importado");
        }
    }

    @Nested
    @DisplayName("importar dos veces")
    class DosVeces {

        @Test
        @DisplayName("⭐ el mismo archivo dos veces no duplica nada")
        void idempotente() {
            Pedido p = pedido(
                    cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000"),
                    cobro(3, "13/02/2026", "18:03", "", "", "Gasto", "Efectivo", "-3500"));
            importador.importar(p);

            Resultado otraVez = importador.importar(p);

            assertThat(otraVez.importacionId()).as("no había nada nuevo").isNull();
            assertThat(otraVez.yaImportados()).isEqualTo(2);
            assertThat(cuantosCobros()).isEqualTo(1);
        }

        @Test
        @DisplayName("dos pases por día iguales en el mismo minuto son dos cobros, y siguen siendo dos")
        void filasIdenticas() {
            Pedido p = pedido(
                    cobro(2, "20/01/2026", "18:00", "", "", "Pase por día", "Efectivo", "11000"),
                    cobro(3, "20/01/2026", "18:00", "", "", "Pase por día", "Efectivo", "11000"));

            assertThat(importador.importar(p).cobros()).isEqualTo(2);
            assertThat(importador.importar(p).yaImportados()).isEqualTo(2);
            assertThat(cuantosCobros()).isEqualTo(2);
        }

        @Test
        @DisplayName("el mismo export una semana después trae solo lo nuevo")
        void unArchivoMasLargo() {
            importador.importar(pedido(cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000")));

            Resultado r = importador.importar(pedido(
                    cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000"),
                    cobro(3, "12/01/2026", "08:00", "Beto", "", "Cuota", "Efectivo", "29000")));

            assertThat(r.cobros()).isEqualTo(1);
            assertThat(r.yaImportados()).isEqualTo(1);
            assertThat(cuantosCobros()).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("un archivo con problemas")
    class ConProblemas {

        @Test
        @DisplayName("⭐ una sola fila mala y no entra nada")
        void todoONada() {
            Pedido p = pedido(
                    cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000"),
                    cobro(3, "31/02/2026", "07:17", "Beto", "", "Cuota", "Efectivo", "29000"),
                    cobro(4, "06/01/2026", "07:17", "Carla", "", "Cuota", "Cheque", "29000"),
                    cobro(5, "07/01/2026", "07:17", "Dani", "", "Cuota", "Efectivo", "veinte mil"));

            assertThatThrownBy(() -> importador.importar(p))
                    .isInstanceOf(ImportacionCajaService.ImportacionConErrores.class);
            assertThat(cuantosCobros()).isZero();

            Analisis a = importador.analizar(p);
            assertThat(a.conError()).isEqualTo(3);
            assertThat(a.filas()).extracting(f -> f.fila()).containsExactly(3, 4, 5);
        }

        @Test
        @DisplayName("una fecha en el futuro es un error, no un cobro adelantado")
        void futuro() {
            LocalDateTime manana = LocalDateTime.now(RELOJ).plusDays(1);
            Analisis a = importador.analizar(pedido(cobro(2, manana.format(DMA), "10:00", "Ana", "", "Cuota", "Efectivo", "29000")));
            assertThat(a.conError()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("lo que ve la vista previa")
    class VistaPrevia {

        @Test
        @DisplayName("los totales mes por mes, antes de guardar nada")
        void porMes() {
            Analisis a = importador.analizar(pedido(
                    cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000"),
                    cobro(3, "06/01/2026", "07:17", "Beto", "", "Cuota", "Efectivo", "$ 26.000"),
                    cobro(4, "13/02/2026", "18:03", "", "", "Gasto", "Efectivo", "-3500")));

            assertThat(a.porMes()).extracting(Mes::mes).containsExactly("2026-01", "2026-02");
            assertThat(a.porMes().get(0).totalCobros()).isEqualByComparingTo("55000");
            assertThat(a.porMes().get(1).totalGastos()).isEqualByComparingTo("3500");
            assertThat(a.desde()).isEqualTo(LocalDateTime.of(2026, 1, 5, 7, 17));
            assertThat(a.hasta()).isEqualTo(LocalDateTime.of(2026, 2, 13, 18, 3));
            assertThat(cuantosCobros()).as("analizar no escribe").isZero();
        }
    }

    @Nested
    @DisplayName("deshacer")
    class Deshacer {

        @Test
        @DisplayName("⭐ se lleva los cobros y los gastos que trajo, y nada más")
        void seLlevaLoQueTrajo() {
            cobrarEnVeltronik(null, "20000", "cash", LocalDateTime.now(RELOJ));
            Resultado r = importador.importar(pedido(
                    cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000"),
                    cobro(3, "13/02/2026", "18:03", "", "", "Gasto", "Efectivo", "-3500")));

            Ultima u = importador.deshacer(r.importacionId());

            assertThat(u.deshecha()).isTrue();
            assertThat(cuantosCobros()).as("el cobro de Veltronik se queda").isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM caja_movimiento WHERE tenant_id = ?", Integer.class, gym)).isZero();

            // Y se puede volver a importar: las claves se fueron con los cobros.
            assertThat(importador.importar(pedido(
                    cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000"))).cobros()).isEqualTo(1);
        }

        @Test
        @DisplayName("no, si alguien corrigió un cobro importado después")
        void siSeEdito() {
            Resultado r = importador.importar(pedido(cobro(2, "05/01/2026", "07:17", "Ana", "", "Cuota", "Efectivo", "29000")));
            // La hora desde Java, no now() de Postgres: el servicio compara contra su propio reloj.
            jdbc.update("UPDATE gym_payment SET amount = 28000, updated_at = ? WHERE tenant_id = ?",
                    LocalDateTime.now().plusMinutes(1), gym);

            assertThat(importador.ultima()).get().extracting(Ultima::sePuedeDeshacer).isEqualTo(false);
            assertThatThrownBy(() -> importador.deshacer(r.importacionId()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("se editó");
        }
    }

    @Nested
    @DisplayName("con el importador de socios")
    class ConElPadron {

        @Test
        @DisplayName("⭐ el historial no le quita al archivo del padrón la palabra sobre el vencimiento")
        void elPadronSigueMandando() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 8, 30, 23, 59, 59), true);
            importador.importar(pedido(cobro(2, "05/08/2026", "08:00", "Ana", "30111222", "Cuota", "Efectivo", "34000")));

            var a = importadorDeSocios.analizar(new com.veltronik.v2.gym.dto.ImportacionSocios.Pedido("socios.xlsx", List.of(
                    new com.veltronik.v2.gym.dto.ImportacionSocios.Fila(2, "Ana", null, "30111222", null, null, null, null,
                            "30/10/2026", null, null, null, null, null, null, null))));

            assertThat(a.filas().get(0).accion()).isEqualTo(com.veltronik.v2.gym.dto.ImportacionSocios.Accion.ACTUALIZAR);
            assertThat(a.filas().get(0).avisos()).noneMatch(m -> m.contains("Ya cobra por Veltronik"));
        }

        @Test
        @DisplayName("deshacer los socios espera a que se deshaga su historial")
        void primeroElHistorial() {
            var socios = importadorDeSocios.importar(new com.veltronik.v2.gym.dto.ImportacionSocios.Pedido("socios.xlsx", List.of(
                    new com.veltronik.v2.gym.dto.ImportacionSocios.Fila(2, "Ana", null, "30111222", null, null, null, null,
                            "30/10/2026", null, null, null, null, null, null, null))));
            importador.importar(pedido(cobro(2, "05/08/2026", "08:00", "Ana", "30111222", "Cuota", "Efectivo", "34000")));

            assertThatThrownBy(() -> importadorDeSocios.deshacer(socios.importacionId()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("historial de caja");
        }
    }

    @Nested
    @DisplayName("el período de cada cobro, para Pagos (V87)")
    class ElPeriodo {

        @Autowired private PeriodosDelHistorialService periodos;
        @Autowired private com.veltronik.v2.gym.repositories.GymPaymentRepository repoPagos;
        @Autowired private com.veltronik.v2.gym.mappers.GymPaymentMapper mapper;

        @Test
        @DisplayName("⭐ cada cuota muestra su mes, y la cobertura sigue vacía")
        void cadaCuotaSuMes() {
            LocalDateTime vence = LocalDateTime.of(2026, 9, 15, 23, 59, 59);
            UUID ana = crearSocio(gym, "Ana", "30111222", vence, true);

            importador.importar(pedido(
                    cobro(2, "17/07/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000"),
                    cobro(3, "16/08/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000"),
                    cobro(4, "20/08/2026", "18:00", "ANA", "30111222", "Pase por día", "Efectivo", "11000"),
                    cobro(5, "03/08/2026", "10:00", "PEREZ JUAN", "30999888", "Cuota", "Transferencia", "34000"),
                    cobro(6, "04/08/2026", "11:00", "", "", "Nueva actividad", "Efectivo", "5000")));

            assertThat(periodoDe("2026-07-17")).containsExactly("2026-07-15", "2026-08-15");
            assertThat(periodoDe("2026-08-16")).as("pagó un día tarde y le corrió desde el 15")
                    .containsExactly("2026-08-15", "2026-09-15");
            assertThat(periodoDe("2026-08-20")).as("el pase cubre ese día").containsExactly("2026-08-20", "2026-08-21");
            assertThat(periodoDe("2026-08-03")).as("un ex-socio: desde el día que pagó")
                    .containsExactly("2026-08-03", "2026-09-03");
            assertThat(periodoDe("2026-08-04")).as("lo que no es una cuota no inventa un período").containsExactly(null, null);

            // ⭐ ADR-014 intacto: ni cobertura en los cobros ni un solo día de vencimiento corrido.
            assertThat(jdbc.queryForObject("SELECT count(*) FROM gym_payment WHERE tenant_id = ? "
                    + "AND (period_start IS NOT NULL OR period_end IS NOT NULL)", Integer.class, gym)).isZero();
            assertThat(socio(ana).get("membership_end")).isEqualTo(Timestamp.valueOf(vence));
            assertThat(jdbc.queryForObject("SELECT periodos_at FROM gym_payment_import WHERE tenant_id = ?",
                    Timestamp.class, gym)).isNotNull();
        }

        @Test
        @DisplayName("llega a la pantalla en el DTO, aparte del período de verdad")
        void llegaAlDto() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 15, 23, 59, 59), true);
            importador.importar(pedido(cobro(2, "16/08/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000")));

            UUID id = jdbc.queryForObject("SELECT id FROM gym_payment WHERE tenant_id = ?", UUID.class, gym);
            var dto = mapper.toDto(repoPagos.findById(id).orElseThrow());

            assertThat(dto.getPeriodoImportadoDesde()).hasToString("2026-08-15");
            assertThat(dto.getPeriodoImportadoHasta()).hasToString("2026-09-15");
            assertThat(dto.getPeriodStart()).isNull();
            assertThat(dto.isImportado()).isTrue();
        }

        @Test
        @DisplayName("⭐ calcular los períodos no bloquea el deshacer")
        void noBloqueaElDeshacer() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 15, 23, 59, 59), true);
            Resultado r = importador.importar(pedido(cobro(2, "16/08/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000")));
            periodos.calcular(r.importacionId(), gym);

            assertThat(importador.ultima()).get().extracting(Ultima::sePuedeDeshacer).isEqualTo(true);
        }

        @Test
        @DisplayName("si ya se le cobró en Veltronik, la cadena termina donde arrancó ese cobro")
        void conUnCobroNuevo() {
            // El padrón decía 15/09; se le cobró en Veltronik y el vencimiento pasó al 15/10.
            UUID ana = crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 10, 15, 23, 59, 59), true);
            jdbc.update("INSERT INTO gym_payment (id, created_at, updated_at, tenant_id, member_id, amount, "
                            + "payment_method, payment_date, status, period_start, period_end) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(), LocalDateTime.now(), LocalDateTime.now(), gym, ana, new BigDecimal("34000"), "cash",
                    LocalDateTime.of(2026, 9, 16, 10, 0), "paid",
                    LocalDateTime.of(2026, 9, 15, 0, 0), LocalDateTime.of(2026, 10, 15, 0, 0));

            importador.importar(pedido(cobro(2, "16/08/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000")));

            assertThat(periodoDe("2026-08-16")).containsExactly("2026-08-15", "2026-09-15");
        }

        @Test
        @DisplayName("⭐ lo importado antes de esta versión se completa solo al arrancar")
        void seCompletaAlArrancar() {
            crearSocio(gym, "Ana", "30111222", LocalDateTime.of(2026, 9, 15, 23, 59, 59), true);
            importador.importar(pedido(cobro(2, "16/08/2026", "08:00", "ANA", "30111222", "Cuota", "Efectivo", "34000")));
            // Como quedó en producción la importación del 21/09: sin períodos y sin la marca.
            jdbc.update("UPDATE gym_payment SET periodo_importado_desde = NULL, periodo_importado_hasta = NULL WHERE tenant_id = ?", gym);
            jdbc.update("UPDATE gym_payment_import SET periodos_at = NULL WHERE tenant_id = ?", gym);

            periodos.completarLasPendientes();

            assertThat(periodoDe("2026-08-16")).containsExactly("2026-08-15", "2026-09-15");
        }

        /** El período estimado del cobro de ese día, como texto: [desde, hasta]. */
        private List<String> periodoDe(String dia) {
            Map<String, Object> f = jdbc.queryForMap("SELECT periodo_importado_desde, periodo_importado_hasta "
                    + "FROM gym_payment WHERE tenant_id = ? AND CAST(payment_date AS date) = CAST(? AS date)", gym, dia);
            return java.util.Arrays.asList(
                    f.get("periodo_importado_desde") == null ? null : f.get("periodo_importado_desde").toString(),
                    f.get("periodo_importado_hasta") == null ? null : f.get("periodo_importado_hasta").toString());
        }
    }

    // ── Siembra y ayudas ───────────────────────────────────────────────────────

    private UUID crearGimnasio() {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                id, now, now, "Gimnasio " + id, "GYM");
        return id;
    }

    private UUID crearSocio(UUID tenant, String nombre, String documento, LocalDateTime vence, boolean activo) {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO gym_member (id, created_at, updated_at, tenant_id, first_name, last_name, "
                        + "email, document, is_active, membership_end) VALUES (?,?,?,?,?,?,?,?,?,?)",
                id, now, now, tenant, nombre, "", "", documento, activo, vence);
        return id;
    }

    private void cobrarEnVeltronik(UUID socio, String monto, String metodo, LocalDateTime cuando) {
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO gym_payment (id, created_at, updated_at, tenant_id, member_id, amount, "
                        + "payment_method, payment_date, status) VALUES (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), now, now, gym, socio, new BigDecimal(monto), metodo, cuando, "paid");
    }

    private static Fila cobro(int n, String fecha, String hora, String socio, String dni, String concepto,
                              String medio, String monto) {
        return new Fila(n, fecha, hora, socio, dni, concepto, medio, monto, null, null);
    }

    private static Pedido pedido(Fila... filas) {
        return new Pedido("historial.xlsx", List.of(filas));
    }

    private Map<String, Object> socio(UUID id) {
        return jdbc.queryForMap("SELECT * FROM gym_member WHERE id = ?", id);
    }

    private int cuantosSocios() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM gym_member WHERE tenant_id = ?", Integer.class, gym);
        return n == null ? 0 : n;
    }

    private int cuantosCobros() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM gym_payment WHERE tenant_id = ?", Integer.class, gym);
        return n == null ? 0 : n;
    }

    private static BigDecimal delMes(DashboardResumenDTO r, String mes) {
        return r.ingresos().serieMensual().stream()
                .filter(m -> m.mes().toString().startsWith(mes))
                .map(DashboardResumenDTO.MesConTotal::total)
                .findFirst()
                .orElse(BigDecimal.ZERO);
    }
}
