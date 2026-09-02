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
    private final com.veltronik.v2.gym.repositories.CajaMovimientoRepository movimientoRepository;

    public CajaService(CajaCierreRepository cierreRepository, GymPaymentRepository paymentRepository,
                       com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository ajusteRepository,
                       com.veltronik.v2.gym.repositories.CajaSesionRepository sesionRepository,
                       com.veltronik.v2.gym.repositories.CajaMovimientoRepository movimientoRepository) {
        this.cierreRepository = cierreRepository;
        this.paymentRepository = paymentRepository;
        this.ajusteRepository = ajusteRepository;
        this.sesionRepository = sesionRepository;
        this.movimientoRepository = movimientoRepository;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Movimientos de caja: lo que entra y sale del cajón sin ser un cobro
    // ─────────────────────────────────────────────────────────────────────────

    /** Los rubros que la pantalla ofrece. Texto libre igual: el gimnasio va a inventar uno. */
    private static final int LARGO_MAXIMO_DETALLE = 255;

    /**
     * Anota plata que entra o sale del cajón sin ser un cobro de socio.
     *
     * <p><b>Por qué hace falta.</b> El arqueo sabía sumar el fondo y lo cobrado, pero del
     * cajón también SALE plata durante el día. Se le pagan $15.000 a la chica de la limpieza
     * y a la noche el sistema espera $15.000 que ya no están: el cierre dice <b>faltante</b>,
     * la persona que atendió no robó nada y el sistema la acusa. Es el mismo bug del fondo
     * inicial con el signo cambiado, y termina igual de mal — te acostumbrás a los faltantes
     * y el día que falta plata de verdad no lo distinguís.</p>
     *
     * <p>⚠️ <b>El detalle es obligatorio en los egresos.</b> No prueba nada por sí solo, pero
     * un renglón que dice "Proveedor — agua, factura 4412" se puede verificar y uno que dice
     * "Proveedor" no. Es lo único que convierte la lista en algo revisable.</p>
     */
    @Transactional
    public com.veltronik.v2.gym.entities.CajaMovimiento registrar(
            String tipo, String categoria, String detalle, BigDecimal monto,
            String metodo, String hechoPor) {

        String t = nullSafe(tipo).toUpperCase();
        if (!com.veltronik.v2.gym.entities.CajaMovimiento.INGRESO.equals(t)
                && !com.veltronik.v2.gym.entities.CajaMovimiento.EGRESO.equals(t)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El movimiento tiene que ser un ingreso o un egreso.");
        }
        // El signo lo pone el tipo, nunca el monto: un negativo es un tipo mal puesto disfrazado.
        if (monto == null || monto.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto tiene que ser mayor a cero.");
        }
        if (nullSafe(categoria).isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta decir en qué se gastó.");
        }
        boolean esEgreso = com.veltronik.v2.gym.entities.CajaMovimiento.EGRESO.equals(t);
        if (esEgreso && nullSafe(detalle).isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Escribí en qué se gastó. Un egreso sin detalle no se puede verificar después.");
        }

        com.veltronik.v2.gym.entities.CajaMovimiento m = new com.veltronik.v2.gym.entities.CajaMovimiento();
        Tenant t2 = new Tenant();
        t2.setId(TenantContextHolder.getTenantId());
        m.setTenant(t2);
        m.setTipo(t);
        m.setCategoria(categoria.trim());
        m.setDetalle(detalle == null || detalle.isBlank() ? null
                : detalle.trim().substring(0, Math.min(detalle.trim().length(), LARGO_MAXIMO_DETALLE)));
        m.setMonto(monto);
        m.setMetodo(nullSafe(metodo).isBlank()
                ? com.veltronik.v2.gym.entities.CajaMovimiento.EFECTIVO : metodo.toUpperCase());
        // La hora la escribe la app en zona argentina: la base responde en la suya y el
        // movimiento caería fuera del período.
        m.setFecha(LocalDateTime.now(BUSINESS_ZONE));
        m.setHechoPorNombre(hechoPor);
        // Se ata a la caja abierta si la hay. Si no hay, se anota igual: se puede gastar plata
        // del cajón con la caja sin abrir, y esa plata falta lo mismo.
        sesionAbierta().ifPresent(s -> m.setSesionId(s.getId()));

        return movimientoRepository.save(m);
    }

    /**
     * Anula un movimiento. No lo borra.
     *
     * <p>Poder borrar un egreso sería poder borrar la prueba. Anular deja el registro, el
     * motivo y quién anuló.</p>
     *
     * <p>⚠️ Un movimiento de un período YA CERRADO no se anula: el cierre congeló su número y
     * anularlo después dejaría un cierre diciendo una cosa y la lista diciendo otra. Corregir
     * es cargar el movimiento inverso, igual que con un cierre.</p>
     */
    @Transactional
    public com.veltronik.v2.gym.entities.CajaMovimiento anular(java.util.UUID id, String motivo, String anuladoPor) {
        com.veltronik.v2.gym.entities.CajaMovimiento m = movimientoRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ese movimiento no existe"));
        if (!m.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ese movimiento no es de este gimnasio");
        }
        if (!m.estaVigente()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese movimiento ya estaba anulado.");
        }
        if (m.getFecha().isBefore(inicioDelPeriodo())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ese movimiento es de una caja ya cerrada. Para corregirlo, cargá uno al revés.");
        }
        m.setAnuladoAt(LocalDateTime.now(BUSINESS_ZONE));
        m.setAnuladoPorNombre(anuladoPor);
        m.setMotivoAnulacion(motivo != null && !motivo.isBlank() ? motivo.trim() : null);
        return movimientoRepository.save(m);
    }

    /**
     * Los movimientos del período abierto, anulados incluidos.
     *
     * <p>Los anulados viajan tachados a propósito: un egreso que aparece y desaparece de la
     * lista es exactamente lo que no queremos que se pueda hacer.</p>
     *
     * <p>A diferencia de los cobros, <b>esto lo puede ver recepción</b>. No rompe el conteo a
     * ciegas: quien cuenta ya sabe cuánto sacó del cajón —lo sacó ella— y con el fondo y los
     * egresos todavía le falta el número grande, que es lo cobrado en efectivo. Y necesita
     * verlo para no cargar dos veces el mismo gasto.</p>
     */
    @Transactional(readOnly = true)
    public List<com.veltronik.v2.gym.entities.CajaMovimiento> movimientosDeCaja() {
        return movimientoRepository.findByTenantIdAndFechaBetweenOrderByFechaDesc(
                TenantContextHolder.getTenantId(), inicioDelPeriodo(), LocalDateTime.now(BUSINESS_ZONE));
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
        // Congelados por lo mismo que el fondo: si no, el esperado de un martes cambiaría en
        // junio porque alguien anuló un egreso viejo, y un historial que se reescribe solo no
        // sirve para comparar nada.
        cierre.setEgresosEfectivo(r.egresosEfectivo());
        cierre.setIngresosEfectivo(r.ingresosEfectivo());
        cierre.setCantidadMovimientos(r.cantidadMovimientos());
        cierre.setConArqueo(conteoCompleto);
        cierre.setDeclaradoEfectivo(declaradoEfectivo);
        cierre.setDeclaradoDigital(declaradoDigital);
        // Negativo = falta plata. Se guarda calculado y no se deduce al leer: si mañana
        // alguien corrige un cobro viejo, la diferencia de este día no puede cambiar.
        //
        // ⚠️ LOS DOS TÉRMINOS QUE HACEN QUE ESTO CUADRE, Y CADA UNO COSTÓ UN BUG:
        //   · EL FONDO. En el cajón está el cambio de ayer MÁS lo cobrado hoy. Sin sumarlo,
        //     TODOS los cierres daban sobrante por el mismo monto.
        //   · LOS EGRESOS. Del cajón también sale plata. Sin restarlos, el día que se le paga
        //     a la limpieza el cierre dice FALTANTE y acusa a quien atendió.
        // Un arqueo que siempre sobra y uno que siempre falta son igual de inútiles.
        BigDecimal esperadoEnElCajon = r.enElCajon(fondo);
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
        // ─── Lo que entró y salió del cajón sin ser un cobro ───
        //
        // ⚠️ SOLO EL EFECTIVO CUENTA ACÁ. Un pago al proveedor por transferencia se anota
        // —el dueño quiere verlo— pero NO toca el arqueo: lo que se declara al cerrar es
        // cuánto ENTRÓ a la cuenta, y meter salidas ahí obligaría a quien cuenta a hacer una
        // resta mental sobre la app del banco.
        //
        // Y los anulados no suman: para eso se anulan.
        BigDecimal egresos = BigDecimal.ZERO;
        BigDecimal ingresosManuales = BigDecimal.ZERO;
        int cuantosMovimientos = 0;

        for (var m : movimientoRepository.findByTenantIdAndFechaBetweenOrderByFechaDesc(
                TenantContextHolder.getTenantId(), desde, hasta)) {
            if (!m.estaVigente()) continue;
            cuantosMovimientos++;
            if (!m.afectaElCajon()) continue;
            if (m.esEgreso()) egresos = egresos.add(m.getMonto());
            else ingresosManuales = ingresosManuales.add(m.getMonto());
        }

        return new Resumen(desde, hasta, efectivo, transferencia, mercadopago, tarjeta, otros, cuantos,
                egresos, ingresosManuales, cuantosMovimientos);
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    /** Lo que el sistema contó en un período. */
    public record Resumen(LocalDateTime desde, LocalDateTime hasta,
                          BigDecimal efectivo, BigDecimal transferencia,
                          BigDecimal mercadopago, BigDecimal tarjeta,
                          BigDecimal otros, int cantidadCobros,
                          BigDecimal egresosEfectivo, BigDecimal ingresosEfectivo,
                          int cantidadMovimientos) {

        /** Transferencias y Mercado Pago juntos: es lo que se revisa de una sola mirada. */
        public BigDecimal digital() {
            return transferencia.add(mercadopago);
        }

        /**
         * Lo que TIENE que haber en el cajón.
         *
         * <p>La cuenta completa, y cada término está por un motivo que costó encontrar:</p>
         * <pre>
         *   fondo inicial          el cambio de ayer — sin esto todo daba SOBRANTE siempre
         * + cobrado en efectivo    lo que entró por la ventanilla
         * + ingresos manuales      plata que entró sin ser un cobro (una venta suelta)
         * - egresos en efectivo    lo que salió — sin esto todo daba FALTANTE siempre
         * </pre>
         *
         * <p>Vive acá y no repartida en la pantalla y el servicio: una cuenta de plata copiada
         * en dos lados es una cuenta que en algún lado va a estar mal.</p>
         */
        public BigDecimal enElCajon(BigDecimal fondo) {
            return (fondo == null ? BigDecimal.ZERO : fondo)
                    .add(efectivo)
                    .add(ingresosEfectivo)
                    .subtract(egresosEfectivo);
        }
    }
}
