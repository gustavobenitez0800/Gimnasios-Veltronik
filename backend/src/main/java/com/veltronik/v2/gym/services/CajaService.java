package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.CajaSesion;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.repositories.CajaCierreRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

/**
 * El arqueo de caja: cuánto dice el sistema que hay, cuánto dice la persona, y la diferencia.
 *
 * <p><b>La caja es del GIMNASIO, no de la máquina.</b> Un gimnasio puede tener la web en una
 * notebook y el escritorio en otra PC, pero hay un solo cajón. El cierre toma todo lo cobrado
 * en el período, desde donde se haya cobrado.</p>
 *
 * <p><b>El período lo definen los cierres, no el calendario.</b> Arranca donde terminó el
 * anterior, así el dueño cierra todos los días, una vez por semana, o cuando quiera.</p>
 */
@Service
public class CajaService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    /**
     * Desde cuándo cuenta el PRIMER cierre de un gimnasio.
     *
     * <p>Sin cierres anteriores no hay un "desde" natural. Se toman 30 días para atrás en vez
     * de "desde siempre": el primer arqueo de un gimnasio que viene de migrar arrastraría
     * meses de cobros históricos y daría una diferencia enorme y sin sentido, que es la peor
     * forma de estrenar la función.</p>
     */
    private static final int DIAS_DEL_PRIMER_CIERRE = 30;

    private final CajaCierreRepository cierreRepository;
    private final GymPaymentRepository paymentRepository;
    private final com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository ajusteRepository;
    private final com.veltronik.v2.gym.repositories.CajaSesionRepository sesionRepository;

    public CajaService(CajaCierreRepository cierreRepository, GymPaymentRepository paymentRepository,
                       com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository ajusteRepository,
                       com.veltronik.v2.gym.repositories.CajaSesionRepository sesionRepository) {
        this.cierreRepository = cierreRepository;
        this.paymentRepository = paymentRepository;
        this.ajusteRepository = ajusteRepository;
        this.sesionRepository = sesionRepository;
    }

    /**
     * Los cobros que se tocaron en el período abierto.
     *
     * <p>Es la otra mitad del arqueo. Un cierre puede cuadrar perfecto y aun así haber algo
     * raro: si alguien registró un cobro de $48.000, después lo bajó a $40.000 y se guardó
     * la diferencia, el cajón cuadra con lo que el sistema espera — porque el sistema fue
     * cambiado. Lo único que lo delata es que ese cobro se tocó.</p>
     */
    @Transactional(readOnly = true)
    public List<com.veltronik.v2.gym.entities.GymPaymentAjuste> ajustesDelPeriodo() {
        return ajusteRepository.findByTenantIdAndCreatedAtBetweenOrderByCreatedAtDesc(
                TenantContextHolder.getTenantId(), inicioDelPeriodo(), LocalDateTime.now(BUSINESS_ZONE));
    }

    /**
     * Abre la caja: desde ahora corre el período, con el cambio que ya había en el cajón.
     *
     * @param fondoInicial el cambio que quedó de ayer. Sin esto el arqueo NUNCA cuadra: ese
     *                     cambio aparece como sobrante todos los días.
     */
    @Transactional
    public CajaSesion abrir(BigDecimal fondoInicial, String abiertaPor) {
        if (fondoInicial == null || fondoInicial.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El fondo no puede ser negativo.");
        }
        // La base ya lo impide con un índice único parcial. Este chequeo existe para dar un
        // mensaje entendible en vez de una violación de constraint; la garantía es la de abajo.
        if (sesionAbierta().isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya hay una caja abierta. Cerrala antes de abrir otra.");
        }

        CajaSesion s = new CajaSesion();
        Tenant t = new Tenant();
        t.setId(TenantContextHolder.getTenantId());
        s.setTenant(t);
        s.setAbiertaAt(LocalDateTime.now(BUSINESS_ZONE));
        s.setAbiertaPorNombre(abiertaPor);
        s.setFondoInicial(fondoInicial);
        return sesionRepository.save(s);
    }

    /** La caja abierta de este gimnasio, si hay alguna. */
    @Transactional(readOnly = true)
    public java.util.Optional<CajaSesion> sesionAbierta() {
        return sesionRepository.findByTenantIdAndCerradaAtIsNull(TenantContextHolder.getTenantId());
    }

    /** Solo para los tests: desde cuándo cuenta el período. */
    LocalDateTime inicioDelPeriodoPublico() {
        return inicioDelPeriodo();
    }

    /**
     * Los cobros que forman el número del período: monto, método, socio y cuándo.
     *
     * <p>Es de dónde sale todo lo demás. El dueño tiene que poder ver la lista y no solo el
     * total: un total que no se puede abrir es un número en el que hay que creer.</p>
     *
     * <p>⚠️ SOLO DUEÑO. Lo verifica el controlador, y no es un detalle de permisos: si quien
     * va a contar puede ver los montos, suma la lista y escribe ese número. El arqueo deja de
     * medir nada.</p>
     */
    @Transactional(readOnly = true)
    public List<GymPayment> movimientosDelPeriodo() {
        return paymentRepository.findByTenantIdAndDateRange(
                        TenantContextHolder.getTenantId(), inicioDelPeriodo(),
                        LocalDateTime.now(BUSINESS_ZONE)).stream()
                .filter(p -> "PAID".equalsIgnoreCase(p.getStatus() == null ? "" : p.getStatus()))
                .toList();
    }

    /** Lo que lleva acumulado el período abierto, sin cerrarlo. */
    @Transactional(readOnly = true)
    public Resumen resumenAbierto() {
        LocalDateTime desde = inicioDelPeriodo();
        LocalDateTime hasta = LocalDateTime.now(BUSINESS_ZONE);
        return contar(desde, hasta);
    }

    /**
     * Cierra el período.
     *
     * @param declaradoEfectivo lo que la persona dice tener en el cajón. NULL = corte sin
     *                          conteo, que solo puede pedir un dueño o admin.
     * @param declaradoDigital  lo que dice haber entrado por transferencia y Mercado Pago.
     *
     * <p><b>Por qué se declaran los dos.</b> Contando solo el cajón quedaba abierto el
     * agujero más grande: cobrar en efectivo, guardarse la plata y registrar el cobro como
     * "transferencia". El cajón cuadra perfecto —el sistema no espera ese efectivo— y la
     * transferencia que el sistema da por recibida nunca existió. Con las dos declaraciones,
     * ese movimiento deja un faltante digital que no se puede tapar.</p>
     */
    @Transactional
    public CajaCierre cerrar(BigDecimal declaradoEfectivo, BigDecimal declaradoDigital,
                             String nota, String cerradoPor, boolean puedeCerrarSinContar) {
        boolean conteoCompleto = declaradoEfectivo != null && declaradoDigital != null;
        if (!conteoCompleto && !puedeCerrarSinContar) {
            // Recepción no tiene esta salida: es la que tiene el cajón adelante. Si pudiera
            // cerrar sin contar —o contando solo una mitad— el arqueo no significaría nada.
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Hay que contar el efectivo y las transferencias para cerrar la caja.");
        }
        if (declaradoEfectivo != null && declaradoEfectivo.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El efectivo no puede ser negativo.");
        }
        if (declaradoDigital != null && declaradoDigital.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las transferencias no pueden ser negativas.");
        }

        java.util.Optional<CajaSesion> sesion = sesionAbierta();
        BigDecimal fondo = sesion.map(CajaSesion::getFondoInicial).orElse(BigDecimal.ZERO);

        LocalDateTime desde = inicioDelPeriodo();
        LocalDateTime hasta = LocalDateTime.now(BUSINESS_ZONE);
        Resumen r = contar(desde, hasta);

        CajaCierre cierre = new CajaCierre();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        cierre.setTenant(tenant);

        cierre.setDesde(desde);
        cierre.setHasta(hasta);
        cierre.setFondoInicial(fondo);
        cierre.setEsperadoEfectivo(r.efectivo());
        cierre.setEsperadoTransferencia(r.transferencia());
        cierre.setEsperadoMercadopago(r.mercadopago());
        cierre.setEsperadoTarjeta(r.tarjeta());
        cierre.setEsperadoOtros(r.otros());
        cierre.setCantidadCobros(r.cantidadCobros());
        cierre.setConArqueo(conteoCompleto);
        cierre.setDeclaradoEfectivo(declaradoEfectivo);
        cierre.setDeclaradoDigital(declaradoDigital);
        // Negativo = falta plata. Se guarda calculado y no se deduce al leer: si mañana
        // alguien corrige un cobro viejo, la diferencia de este día no puede cambiar.
        // ⚠️ EL FONDO ENTRA ACÁ. En el cajón hay el cambio de ayer MÁS lo cobrado hoy; si el
        // esperado fuera solo lo cobrado, todos los cierres darían sobrante por el mismo
        // monto, y un arqueo que siempre sobra es un arqueo que nadie mira.
        BigDecimal esperadoEnElCajon = r.efectivo().add(fondo);
        cierre.setDiferencia(declaradoEfectivo == null ? null : declaradoEfectivo.subtract(esperadoEnElCajon));
        // Negativo = el sistema dice que entró plata que en la cuenta no está.
        cierre.setDiferenciaDigital(declaradoDigital == null ? null : declaradoDigital.subtract(r.digital()));
        cierre.setNota(nota != null && !nota.isBlank() ? nota.trim() : null);
        cierre.setCerradoPorNombre(cerradoPor);

        CajaCierre guardado = cierreRepository.save(cierre);

        // La sesión se cierra con el mismo acto: si quedara abierta, no se podría abrir otra
        // y el período siguiente arrancaría de una fecha que ya se cerró.
        sesion.ifPresent(ses -> {
            ses.setCerradaAt(hasta);
            ses.setCierreId(guardado.getId());
            sesionRepository.save(ses);
        });

        return guardado;
    }

    /**
     * Agrega la explicación de una diferencia. UNA sola vez.
     *
     * <p>La nota se escribe DESPUÉS de ver la diferencia —antes nadie sabe qué explicar—
     * pero el número ya quedó congelado en el mismo instante en que se declaró. Esa
     * separación es lo que impide declarar, espiar el resultado, cancelar y volver a
     * empezar con el número correcto.</p>
     *
     * <p>Se puede agregar pero no reescribir: una explicación que se puede cambiar después
     * es una explicación que no explica nada.</p>
     */
    @Transactional
    public CajaCierre explicar(java.util.UUID cierreId, String nota) {
        CajaCierre c = cierreRepository.findById(cierreId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cierre no encontrado"));
        if (!c.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ese cierre no es de este gimnasio");
        }
        if (c.getNota() != null && !c.getNota().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese cierre ya tiene una explicación.");
        }
        c.setNota(nota != null && !nota.isBlank() ? nota.trim() : null);
        return cierreRepository.save(c);
    }

    /** El historial, del más reciente al más viejo. */
    @Transactional(readOnly = true)
    public List<CajaCierre> historial(int cuantos) {
        return cierreRepository.findByTenantIdOrderByHastaDesc(
                TenantContextHolder.getTenantId(), PageRequest.of(0, Math.min(Math.max(cuantos, 1), 200)));
    }

    /** Cuándo fue el último cierre. Lo usa la pantalla para avisar si hace días que no se cierra. */
    @Transactional(readOnly = true)
    public Optional<CajaCierre> ultimo() {
        return cierreRepository.findTopByTenantIdOrderByHastaDesc(TenantContextHolder.getTenantId());
    }

    /**
     * Desde cuándo cuenta el período.
     *
     * <p>Si hay una caja abierta, desde que se abrió. Si no, desde el último cierre — así lo
     * que se cobró con la caja sin abrir <b>no queda sin contar</b>: alguien puede cobrar
     * antes de que nadie abra nada, y esa plata está en el cajón igual.</p>
     */
    private LocalDateTime inicioDelPeriodo() {
        return sesionAbierta().map(CajaSesion::getAbiertaAt).orElseGet(this::desdeElUltimoCierre);
    }

    private LocalDateTime desdeElUltimoCierre() {
        return cierreRepository.findTopByTenantIdOrderByHastaDesc(TenantContextHolder.getTenantId())
                .map(CajaCierre::getHasta)
                .orElseGet(() -> LocalDateTime.now(BUSINESS_ZONE).minusDays(DIAS_DEL_PRIMER_CIERRE));
    }

    /**
     * Suma los cobros del período, separados por método.
     *
     * <p>Solo cuentan los cobrados: un pago pendiente no puso plata en ningún cajón.</p>
     */
    private Resumen contar(LocalDateTime desde, LocalDateTime hasta) {
        List<GymPayment> pagos = paymentRepository.findByTenantIdAndDateRange(
                TenantContextHolder.getTenantId(), desde, hasta);

        BigDecimal efectivo = BigDecimal.ZERO;
        BigDecimal transferencia = BigDecimal.ZERO;
        BigDecimal mercadopago = BigDecimal.ZERO;
        BigDecimal tarjeta = BigDecimal.ZERO;
        BigDecimal otros = BigDecimal.ZERO;
        int cuantos = 0;

        for (GymPayment p : pagos) {
            if (!"PAID".equalsIgnoreCase(nullSafe(p.getStatus()))) continue;
            BigDecimal monto = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
            cuantos++;
            switch (nullSafe(p.getPaymentMethod()).toUpperCase()) {
                case "CASH" -> efectivo = efectivo.add(monto);
                case "TRANSFER" -> transferencia = transferencia.add(monto);
                // Mercado Pago es una de las opciones que ofrece el sistema al cobrar, pero
                // acá no estaba y caía en "otros" con los métodos raros: el gimnasio que
                // cobra por MP no veía esa plata en ninguna parte del arqueo.
                case "MERCADOPAGO", "MERCADO_PAGO", "MP" -> mercadopago = mercadopago.add(monto);
                case "CARD" -> tarjeta = tarjeta.add(monto);
                default -> otros = otros.add(monto);
            }
        }
        return new Resumen(desde, hasta, efectivo, transferencia, mercadopago, tarjeta, otros, cuantos);
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    /** Lo que el sistema contó en un período. */
    public record Resumen(LocalDateTime desde, LocalDateTime hasta,
                          BigDecimal efectivo, BigDecimal transferencia,
                          BigDecimal mercadopago, BigDecimal tarjeta,
                          BigDecimal otros, int cantidadCobros) {

        /** Transferencias y Mercado Pago juntos: es lo que se revisa de una sola mirada. */
        public BigDecimal digital() {
            return transferencia.add(mercadopago);
        }
    }
}
