package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.repositories.CashierRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.CajaMovimiento;
import com.veltronik.v2.gym.entities.GymPayment;
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
 * Todo lo que pasó por la caja en un rango de días, para el Excel que el dueño le manda al
 * contador todos los días.
 *
 * <p><b>Los totales salen de {@link CajaService#balance(LocalDate, LocalDate)}</b>, la misma
 * cuenta del cierre y del balance de la pantalla: si el Excel sumara por su lado, el día que las
 * dos cuentas difieran el contador y el dueño estarían mirando números distintos. Lo único que se
 * suma acá es lo que ninguna otra pantalla calcula: los gastos e ingresos que no tocaron el cajón
 * (pagados por transferencia), que el arqueo no mira pero el contador sí.</p>
 *
 * <p>Como la caja, deja afuera el historial importado (ADR-014): esa plata se rindió en el
 * sistema anterior.</p>
 */
@Service
public class CajaReporteService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    private final CajaService caja;
    private final GymPaymentRepository pagos;
    private final CajaMovimientoRepository movimientos;
    private final CajaCierreRepository cierres;
    private final CashierRepository cajeros;
    private final TenantRepository gimnasios;

    public CajaReporteService(CajaService caja, GymPaymentRepository pagos, CajaMovimientoRepository movimientos,
                              CajaCierreRepository cierres, CashierRepository cajeros, TenantRepository gimnasios) {
        this.caja = caja;
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

        List<CobroDelReporte> cobros = pagos.findByTenantIdAndDateRange(gym, inicio, fin).stream()
                .filter(p -> !p.esImportado())
                .filter(p -> "PAID".equalsIgnoreCase(p.getStatus() == null ? "" : p.getStatus()))
                .sorted(Comparator.comparing(GymPayment::getPaymentDate))
                .map(p -> cobro(p, nombreDeCajero))
                .toList();

        List<CajaMovimiento> movs = movimientos.findByTenantIdAndFechaBetweenOrderByFechaDesc(gym, inicio, fin).stream()
                .filter(m -> !m.esImportado())
                .sorted(Comparator.comparing(CajaMovimiento::getFecha))
                .toList();

        BigDecimal ingresosOtros = BigDecimal.ZERO;
        BigDecimal egresosOtros = BigDecimal.ZERO;
        for (CajaMovimiento m : movs) {
            if (!m.estaVigente() || m.afectaElCajon()) continue;
            if (m.esEgreso()) egresosOtros = egresosOtros.add(m.getMonto());
            else ingresosOtros = ingresosOtros.add(m.getMonto());
        }

        CajaService.Resumen r = caja.balance(desde, hasta);
        BigDecimal cobrado = r.efectivo().add(r.digital()).add(r.tarjeta()).add(r.otros());
        Totales totales = new Totales(
                r.efectivo(), r.transferencia(), r.mercadopago(), r.tarjeta(), r.otros(), cobrado,
                r.cantidadCobros(),
                r.ingresosEfectivo(), ingresosOtros, r.egresosEfectivo(), egresosOtros,
                // Lo que ganó el gimnasio en el rango: todo lo que entró menos todo lo que salió,
                // por el medio que sea. Los anulados no cuentan.
                cobrado.add(r.ingresosEfectivo()).add(ingresosOtros).subtract(r.egresosEfectivo()).subtract(egresosOtros));

        String gimnasio = gimnasios.findById(gym).map(t -> t.getName()).orElse("");

        return new Reporte(gimnasio, desde, hasta, LocalDateTime.now(BUSINESS_ZONE), totales, cobros,
                movs.stream().map(CajaReporteService::movimiento).toList(),
                cierres.findByTenantIdAndHastaBetweenOrderByHastaAsc(gym, inicio, fin).stream()
                        .map(CajaReporteService::cierre).toList());
    }

    private static CobroDelReporte cobro(GymPayment p, Map<UUID, String> nombreDeCajero) {
        String socio = null;
        String dni = null;
        if (p.getMember() != null) {
            socio = (nvl(p.getMember().getFirstName()) + " " + nvl(p.getMember().getLastName())).trim();
            dni = p.getMember().getDocument();
        }
        return new CobroDelReporte(
                p.getPaymentDate(), socio, dni,
                p.getPlan() == null ? null : p.getPlan().getName(),
                p.getNotes(),
                p.getPeriodStart() == null ? null : p.getPeriodStart().toLocalDate(),
                p.getPeriodEnd() == null ? null : p.getPeriodEnd().toLocalDate(),
                p.getPaymentMethod(), p.getAmount(),
                p.getPerformedByCashierId() == null ? null : nombreDeCajero.get(p.getPerformedByCashierId()));
    }

    private static MovimientoDelReporte movimiento(CajaMovimiento m) {
        return new MovimientoDelReporte(m.getFecha(), m.getTipo(), m.getCategoria(), m.getDetalle(), m.getMetodo(),
                m.getMonto(), m.getHechoPorNombre(), m.afectaElCajon(), !m.estaVigente(),
                m.getAnuladoPorNombre(), m.getMotivoAnulacion());
    }

    private static CierreDelReporte cierre(CajaCierre c) {
        BigDecimal fondo = nvl(c.getFondoInicial());
        // La cuenta del cajón vive en UN lugar (Resumen.enElCajon): se arma un Resumen con los
        // números que congeló el cierre en vez de repetir la suma acá.
        BigDecimal enElCajon = new CajaService.Resumen(c.getDesde(), c.getHasta(),
                nvl(c.getEsperadoEfectivo()), nvl(c.getEsperadoTransferencia()), nvl(c.getEsperadoMercadopago()),
                nvl(c.getEsperadoTarjeta()), nvl(c.getEsperadoOtros()), c.getCantidadCobros(),
                nvl(c.getEgresosEfectivo()), nvl(c.getIngresosEfectivo()), c.getCantidadMovimientos())
                .enElCajon(fondo);
        return new CierreDelReporte(c.getDesde(), c.getHasta(), c.getCerradoPorNombre(), fondo,
                nvl(c.getEsperadoEfectivo()), nvl(c.getEsperadoTransferencia()), nvl(c.getEsperadoMercadopago()),
                nvl(c.getEsperadoTarjeta()), nvl(c.getEsperadoOtros()), c.getCantidadCobros(),
                nvl(c.getIngresosEfectivo()), nvl(c.getEgresosEfectivo()), enElCajon,
                c.getRetiroEfectivo(), c.getQuedaEnCaja(), c.getNota());
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

    public record Totales(BigDecimal efectivo, BigDecimal transferencia, BigDecimal mercadopago,
                          BigDecimal tarjeta, BigDecimal otros, BigDecimal cobrado, int cantidadCobros,
                          BigDecimal ingresosEfectivo, BigDecimal ingresosOtros,
                          BigDecimal egresosEfectivo, BigDecimal egresosOtros, BigDecimal neto) { }

    public record CobroDelReporte(LocalDateTime fecha, String socio, String dni, String arancel, String nota,
                                  LocalDate periodoDesde, LocalDate periodoHasta, String metodo,
                                  BigDecimal monto, String cobradoPor) { }

    public record MovimientoDelReporte(LocalDateTime fecha, String tipo, String categoria, String detalle,
                                       String metodo, BigDecimal monto, String hechoPor, boolean tocaElCajon,
                                       boolean anulado, String anuladoPor, String motivoAnulacion) { }

    /** Un cierre del rango, con la cuenta del cajón a la vista: fondo + efectivo + ingresos − gastos. */
    public record CierreDelReporte(LocalDateTime desde, LocalDateTime hasta, String cerradoPor,
                                   BigDecimal fondo, BigDecimal efectivo, BigDecimal transferencia,
                                   BigDecimal mercadopago, BigDecimal tarjeta, BigDecimal otros,
                                   int cantidadCobros, BigDecimal ingresosEfectivo, BigDecimal egresosEfectivo,
                                   BigDecimal enElCajon, BigDecimal retiro, BigDecimal quedaEnCaja, String nota) { }
}
