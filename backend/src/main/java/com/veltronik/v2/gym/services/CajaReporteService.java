package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.repositories.CashierRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.CajaMovimiento;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.entities.MetodoDePago;
import com.veltronik.v2.gym.repositories.CajaCierreRepository;
import com.veltronik.v2.gym.repositories.CajaMovimientoRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Todo lo que entró y salió en un rango de días, para el Excel que el dueño le manda al contador
 * todos los días.
 *
 * <p><b>Los totales son la suma de los renglones que el Excel muestra</b>, y esos renglones son
 * los del {@link LibroDeIngresos}: los mismos cobros y ventas que cuentan el tablero, Pagos y el
 * balance de la caja. {@code UnSoloNumeroIntegrationTest} verifica que el total del Excel es el
 * del libro, peso por peso. Un contador que suma la columna tiene que llegar al total de la hoja
 * de resumen, y el dueño tiene que ver ese mismo número en la pantalla.</p>
 *
 * <p><b>Lo importado del sistema anterior va adentro, marcado</b> (decisión del 2026-09-22): es
 * plata que entró, así que está en los ingresos del período; pero la cobró el otro sistema, así
 * que ningún cierre de caja la cuenta (ADR-014) y cada renglón lo dice.</p>
 *
 * <p><b>Un aporte o un retiro del dueño no es ni ingreso ni gasto.</b> Mueve el cajón, pero es
 * plata que ya era suya: va en su propio renglón y no toca el resultado.</p>
 */
@Service
public class CajaReporteService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    private final GymPaymentRepository pagos;
    private final CajaMovimientoRepository movimientos;
    private final CajaCierreRepository cierres;
    private final CashierRepository cajeros;
    private final TenantRepository gimnasios;

    public CajaReporteService(GymPaymentRepository pagos, CajaMovimientoRepository movimientos,
                              CajaCierreRepository cierres, CashierRepository cajeros, TenantRepository gimnasios) {
        this.pagos = pagos;
        this.movimientos = movimientos;
        this.cierres = cierres;
        this.cajeros = cajeros;
        this.gimnasios = gimnasios;
    }

    /** El reporte de un rango de días (un solo día: desde = hasta). */
    @Transactional(readOnly = true)
    public Reporte reporte(LocalDate desde, LocalDate hasta) {
        CajaService.validarRango(desde, hasta);
        UUID gym = TenantContextHolder.getTenantId();
        LocalDateTime inicio = desde.atStartOfDay();
        LocalDateTime fin = CajaService.finDelDia(hasta);

        Map<UUID, String> nombreDeCajero = new HashMap<>();
        for (Cashier c : cajeros.findByTenantIdOrderByActiveDescNameAsc(gym)) {
            nombreDeCajero.put(c.getId(), c.getName());
        }

        // Los cobrados, de Veltronik y del historial. Pendientes y anulados no son plata que entró.
        List<GymPayment> cobrados = pagos.findByTenantIdAndDateRange(gym, inicio, fin).stream()
                .filter(GymPayment::estaCobrado)
                .sorted(Comparator.comparing(GymPayment::getPaymentDate))
                .toList();

        List<CajaMovimiento> movs = movimientos.findByTenantIdAndFechaBetweenOrderByFechaDesc(gym, inicio, fin).stream()
                .sorted(Comparator.comparing(CajaMovimiento::getFecha))
                .toList();

        // ── Los totales: la suma de los renglones de arriba, uno por uno ──
        Suma cobros = new Suma();
        BigDecimal historial = BigDecimal.ZERO;
        int cantidadHistorial = 0;
        for (GymPayment p : cobrados) {
            cobros.sumar(p.getPaymentMethod(), p.getAmount());
            if (p.esImportado()) {
                historial = historial.add(nvl(p.getAmount()));
                cantidadHistorial++;
            }
        }

        BigDecimal ingresosEfectivo = BigDecimal.ZERO, ingresosOtros = BigDecimal.ZERO;
        BigDecimal egresosEfectivo = BigDecimal.ZERO, egresosOtros = BigDecimal.ZERO, gastosHistorial = BigDecimal.ZERO;
        BigDecimal aportes = BigDecimal.ZERO, retiros = BigDecimal.ZERO;
        for (CajaMovimiento m : movs) {
            if (!m.estaVigente()) continue;
            BigDecimal monto = nvl(m.getMonto());
            if (m.esMovimientoDeFondos()) {
                if (m.esEgreso()) retiros = retiros.add(monto);
                else aportes = aportes.add(monto);
            } else if (m.esEgreso()) {
                if (m.afectaElCajon()) egresosEfectivo = egresosEfectivo.add(monto);
                else egresosOtros = egresosOtros.add(monto);
                if (m.esImportado()) gastosHistorial = gastosHistorial.add(monto);
            } else if (m.esImportado()) {
                // El importador no trae ingresos sueltos (los cobros van a gym_payment), y el libro
                // no los contaría: si alguna vez aparece uno, tampoco lo cuenta el Excel.
                continue;
            } else if (m.afectaElCajon()) {
                ingresosEfectivo = ingresosEfectivo.add(monto);
            } else {
                ingresosOtros = ingresosOtros.add(monto);
            }
        }

        BigDecimal cobrado = cobros.total();
        BigDecimal ingresos = cobrado.add(ingresosEfectivo).add(ingresosOtros);
        Totales totales = new Totales(
                cobros.efectivo, cobros.transferencia, cobros.mercadopago, cobros.tarjeta, cobros.otros,
                cobrado, cobrados.size(),
                ingresosEfectivo, ingresosOtros, egresosEfectivo, egresosOtros,
                // Lo que ganó el gimnasio en el rango: todo lo que entró menos todo lo que se gastó,
                // por el medio que sea. Sin anulados y sin los aportes y retiros del dueño.
                ingresos.subtract(egresosEfectivo).subtract(egresosOtros),
                cobrado.subtract(historial), historial, cantidadHistorial, gastosHistorial,
                ingresos, aportes, retiros);

        String gimnasio = gimnasios.findById(gym).map(t -> t.getName()).orElse("");

        return new Reporte(gimnasio, desde, hasta, LocalDateTime.now(BUSINESS_ZONE), totales,
                cobrados.stream().map(p -> cobro(p, nombreDeCajero)).toList(),
                movs.stream().map(CajaReporteService::movimiento).toList(),
                cierres.findByTenantIdAndHastaBetweenOrderByHastaAsc(gym, inicio, fin).stream()
                        .map(CajaReporteService::cierre).toList());
    }

    /** La suma por forma de pago, con la misma clasificación que el libro y la caja. */
    private static final class Suma {
        BigDecimal efectivo = BigDecimal.ZERO, transferencia = BigDecimal.ZERO, mercadopago = BigDecimal.ZERO,
                tarjeta = BigDecimal.ZERO, otros = BigDecimal.ZERO;

        void sumar(String metodo, BigDecimal monto) {
            BigDecimal m = nvl(monto);
            switch (MetodoDePago.normalizar(metodo)) {
                case MetodoDePago.EFECTIVO -> efectivo = efectivo.add(m);
                case MetodoDePago.TRANSFERENCIA -> transferencia = transferencia.add(m);
                case MetodoDePago.MERCADO_PAGO -> mercadopago = mercadopago.add(m);
                case MetodoDePago.TARJETA -> tarjeta = tarjeta.add(m);
                default -> otros = otros.add(m);
            }
        }

        BigDecimal total() {
            return efectivo.add(transferencia).add(mercadopago).add(tarjeta).add(otros);
        }
    }

    private static CobroDelReporte cobro(GymPayment p, Map<UUID, String> nombreDeCajero) {
        String socio = null;
        String dni = null;
        if (p.getMember() != null) {
            socio = (nvl(p.getMember().getFirstName()) + " " + nvl(p.getMember().getLastName())).trim();
            dni = p.getMember().getDocument();
        }
        // Del historial importado, el período es el ESTIMADO (V87): no es cobertura, pero es lo
        // que el contador quiere leer ("la cuota de agosto").
        LocalDate periodoDesde = p.esImportado() ? p.getPeriodoImportadoDesde()
                : p.getPeriodStart() == null ? null : p.getPeriodStart().toLocalDate();
        LocalDate periodoHasta = p.esImportado() ? p.getPeriodoImportadoHasta()
                : p.getPeriodEnd() == null ? null : p.getPeriodEnd().toLocalDate();
        return new CobroDelReporte(
                p.getPaymentDate(), socio, dni,
                p.getPlan() == null ? null : p.getPlan().getName(),
                p.getNotes(), periodoDesde, periodoHasta,
                p.getPaymentMethod(), p.getAmount(),
                p.getPerformedByCashierId() == null ? null : nombreDeCajero.get(p.getPerformedByCashierId()),
                p.esImportado());
    }

    private static MovimientoDelReporte movimiento(CajaMovimiento m) {
        return new MovimientoDelReporte(m.getFecha(), m.getTipo(), m.getCategoria(), m.getDetalle(), m.getMetodo(),
                m.getMonto(), m.getHechoPorNombre(), m.afectaElCajon(), !m.estaVigente(),
                m.getAnuladoPorNombre(), m.getMotivoAnulacion(), m.esImportado(), m.esMovimientoDeFondos());
    }

    private static CierreDelReporte cierre(CajaCierre c) {
        BigDecimal fondo = nvl(c.getFondoInicial());
        // La cuenta del cajón vive en UN lugar (Resumen.enElCajon): se arma un Resumen con los
        // números que congeló el cierre en vez de repetir la suma acá.
        BigDecimal enElCajon = new CajaService.Resumen(c.getDesde(), c.getHasta(),
                nvl(c.getEsperadoEfectivo()), nvl(c.getEsperadoTransferencia()), nvl(c.getEsperadoMercadopago()),
                nvl(c.getEsperadoTarjeta()), nvl(c.getEsperadoOtros()), c.getCantidadCobros(),
                nvl(c.getEgresosEfectivo()), nvl(c.getIngresosEfectivo()), c.getCantidadMovimientos(),
                nvl(c.getIngresosOtrosMedios()), nvl(c.getAjustesEfectivo()), nvl(c.getAjustesOtrosMedios()),
                c.getCantidadAjustes())
                .enElCajon(fondo);
        return new CierreDelReporte(c.getDesde(), c.getHasta(), c.getCerradoPorNombre(), fondo,
                nvl(c.getEsperadoEfectivo()), nvl(c.getEsperadoTransferencia()), nvl(c.getEsperadoMercadopago()),
                nvl(c.getEsperadoTarjeta()), nvl(c.getEsperadoOtros()), c.getCantidadCobros(),
                nvl(c.getIngresosEfectivo()), nvl(c.getEgresosEfectivo()), enElCajon,
                c.getRetiroEfectivo(), c.getQuedaEnCaja(), c.getNota(),
                nvl(c.getIngresosOtrosMedios()), nvl(c.getAjustesEfectivo()), nvl(c.getAjustesOtrosMedios()),
                c.getCantidadAjustes());
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }

    private static BigDecimal nvl(BigDecimal b) {
        return b == null ? BigDecimal.ZERO : b;
    }

    public record Reporte(String gimnasio, LocalDate desde, LocalDate hasta, LocalDateTime generado,
                          Totales totales, List<CobroDelReporte> cobros,
                          List<MovimientoDelReporte> movimientos, List<CierreDelReporte> cierres) { }

    /**
     * Los totales del rango. Los primeros campos conservan el nombre y el sentido de antes (los
     * lee el Excel de los escritorios que todavía no actualizaron).
     *
     * @param efectivo        …{@code otros}: los COBROS por forma de pago, Veltronik e historial
     * @param cobrado         la suma de esos cinco
     * @param neto            ingresos menos gastos, sin los aportes ni los retiros del dueño
     * @param cuotas          lo cobrado en Veltronik
     * @param historial       lo importado del sistema anterior (ya está dentro de {@code cobrado})
     * @param gastosHistorial gastos importados del sistema anterior (ya están dentro de los egresos)
     * @param ingresos        todo lo que entró: cobros + otros ingresos. Es el total del libro
     * @param aportes         plata que el dueño puso en el cajón. No es ingreso
     * @param retiros         plata que el dueño sacó del cajón. No es gasto
     */
    public record Totales(BigDecimal efectivo, BigDecimal transferencia, BigDecimal mercadopago,
                          BigDecimal tarjeta, BigDecimal otros, BigDecimal cobrado, int cantidadCobros,
                          BigDecimal ingresosEfectivo, BigDecimal ingresosOtros,
                          BigDecimal egresosEfectivo, BigDecimal egresosOtros, BigDecimal neto,
                          BigDecimal cuotas, BigDecimal historial, int cantidadHistorial, BigDecimal gastosHistorial,
                          BigDecimal ingresos, BigDecimal aportes, BigDecimal retiros) { }

    /** @param importado vino del sistema anterior: suma en los ingresos, no pasó por esta caja. */
    public record CobroDelReporte(LocalDateTime fecha, String socio, String dni, String arancel, String nota,
                                  LocalDate periodoDesde, LocalDate periodoHasta, String metodo,
                                  BigDecimal monto, String cobradoPor, boolean importado) { }

    /** @param deFondos un aporte o un retiro del dueño: no es ingreso ni gasto del negocio. */
    public record MovimientoDelReporte(LocalDateTime fecha, String tipo, String categoria, String detalle,
                                       String metodo, BigDecimal monto, String hechoPor, boolean tocaElCajon,
                                       boolean anulado, String anuladoPor, String motivoAnulacion,
                                       boolean importado, boolean deFondos) { }

    /** Un cierre del rango, con la cuenta del cajón a la vista: fondo + efectivo + ingresos − gastos ± correcciones. */
    public record CierreDelReporte(LocalDateTime desde, LocalDateTime hasta, String cerradoPor,
                                   BigDecimal fondo, BigDecimal efectivo, BigDecimal transferencia,
                                   BigDecimal mercadopago, BigDecimal tarjeta, BigDecimal otros,
                                   int cantidadCobros, BigDecimal ingresosEfectivo, BigDecimal egresosEfectivo,
                                   BigDecimal enElCajon, BigDecimal retiro, BigDecimal quedaEnCaja, String nota,
                                   BigDecimal ingresosOtrosMedios, BigDecimal ajustesEfectivo,
                                   BigDecimal ajustesOtrosMedios, int cantidadAjustes) { }
}
