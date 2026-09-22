package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.entities.CajaSesion;
import com.veltronik.v2.gym.entities.MetodoDePago;
import com.veltronik.v2.gym.repositories.CajaCierreRepository;
import lombok.extern.slf4j.Slf4j;
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
import java.util.UUID;

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
@Slf4j
@Service
public class CajaService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    /**
     * Hasta cuántos días para atrás mira un cierre.
     *
     * <p>Nació como la regla del PRIMER cierre: sin cierres anteriores no hay un "desde"
     * natural, y el primer arqueo de un gimnasio que viene de migrar arrastraría meses de cobros
     * históricos. Desde la V88 vale para todos: lo sin sellar más viejo que esto es carga
     * histórica (los cobros de un cuaderno pasados al sistema), y esa plata ya no está en el
     * cajón. Ver {@link ContadorDeCaja}.</p>
     */
    public static final int DIAS_QUE_MIRA_UN_CIERRE = 30;

    private final CajaCierreRepository cierreRepository;
    private final com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository ajusteRepository;
    private final com.veltronik.v2.gym.repositories.CajaSesionRepository sesionRepository;
    private final com.veltronik.v2.gym.repositories.CajaMovimientoRepository movimientoRepository;
    private final com.veltronik.v2.gym.repositories.CajaCierreAjusteRepository correccionRepository;
    private final ContadorDeCaja contador;
    private final LibroDeIngresos libro;

    public CajaService(CajaCierreRepository cierreRepository,
                       com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository ajusteRepository,
                       com.veltronik.v2.gym.repositories.CajaSesionRepository sesionRepository,
                       com.veltronik.v2.gym.repositories.CajaMovimientoRepository movimientoRepository,
                       com.veltronik.v2.gym.repositories.CajaCierreAjusteRepository correccionRepository,
                       ContadorDeCaja contador, LibroDeIngresos libro) {
        this.cierreRepository = cierreRepository;
        this.ajusteRepository = ajusteRepository;
        this.sesionRepository = sesionRepository;
        this.movimientoRepository = movimientoRepository;
        this.correccionRepository = correccionRepository;
        this.contador = contador;
        this.libro = libro;
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
     *
     * <p><b>⭐ Y ahora también se puede anotar SIN INTERNET.</b> El terminal lo guarda en su
     * cola y lo manda cuando vuelve la conexión, con dos cosas que no son opcionales:</p>
     *
     * <ul>
     *   <li><b>{@code clientRef}</b> — el sello del terminal. El vaciado de la cola reintenta,
     *       y un gasto de $15.000 anotado dos veces deja un faltante de $15.000 que nunca
     *       existió, con la culpa puesta en quien atendió. La guarda va <b>antes de tocar
     *       nada</b>, y la garantía real es el índice único parcial de la V63.</li>
     *   <li><b>{@code ocurridoEn}</b> — cuándo salió la plata. Sin esto, un gasto de las 22:00
     *       que sube a las 09:00 del día siguiente cae en el arqueo equivocado y descuadra
     *       <b>los dos días</b>. No se le cree al reloj del terminal: se acota
     *       ({@link MomentoDeclarado}).</li>
     * </ul>
     */
    @Transactional
    public com.veltronik.v2.gym.entities.CajaMovimiento registrar(
            String tipo, String categoria, String detalle, BigDecimal monto,
            String metodo, String hechoPor, java.util.UUID clientRef, LocalDateTime ocurridoEn) {

        // ⚠️ ANTES DE VALIDAR Y ANTES DE ESCRIBIR. Un reintento de algo ya guardado devuelve lo
        // que hay y no vuelve a pasar por nada: ni por las validaciones, ni por el save. Es el
        // mismo orden que ya usa `AccessLogService.registerScan`.
        if (clientRef != null) {
            var yaEstaba = movimientoRepository.findByTenantIdAndClientRef(
                    TenantContextHolder.getTenantId(), clientRef);
            if (yaEstaba.isPresent()) return yaEstaba.get();
        }

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
        // Sin forma de pago es efectivo (lo que sale del cajón, que es para lo que existe esto). Una
        // que no se entiende se rechaza: guardarla como vino la dejaba fuera de toda cuenta.
        String forma = nullSafe(metodo).isBlank() ? MetodoDePago.EFECTIVO : MetodoDePago.reconocer(metodo);
        if (forma == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No conozco la forma de pago «" + metodo + "».");
        }
        m.setMetodo(forma);
        // La hora la escribe la app en zona argentina: la base responde en la suya y el
        // movimiento caería fuera del período. Con conexión es ahora; encolado, el momento en
        // que la plata salió del cajón — acotado, porque el reloj del mostrador puede estar
        // mal por meses y nadie lo mira.
        LocalDateTime cuando = MomentoDeclarado.acotar(ocurridoEn);
        m.setFecha(cuando);
        m.setClientRef(clientRef);
        m.setHechoPorNombre(hechoPor);
        // Se ata a la caja abierta si la hay. Si no hay, se anota igual: se puede gastar plata
        // del cajón con la caja sin abrir, y esa plata falta lo mismo.
        //
        // ⚠️ Solo si el movimiento CAE DENTRO de esa caja. Uno que ocurrió anoche y sube hoy
        // pertenece al período de anoche: atarlo a la sesión abierta esta mañana diría que
        // pasó en un turno en el que no pasó. El arqueo cuenta por fecha, así que la fecha ya
        // lo pone donde va; esto es para que la firma del turno tampoco mienta.
        sesionAbierta()
                .filter(s -> s.getAbiertaAt() == null || !cuando.isBefore(s.getAbiertaAt()))
                .ifPresent(s -> m.setSesionId(s.getId()));

        return movimientoRepository.save(m);
    }

    /**
     * La firma vieja, para lo que anota con conexión.
     *
     * <p>Sin sello y sin momento: los pone el servidor, que es lo que ya hacía.</p>
     */
    @Transactional
    public com.veltronik.v2.gym.entities.CajaMovimiento registrar(
            String tipo, String categoria, String detalle, BigDecimal monto,
            String metodo, String hechoPor) {
        return registrar(tipo, categoria, detalle, monto, metodo, hechoPor, null, null);
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
        if (m.esImportado()) {
            // No es de este cajón: vino con el historial del sistema anterior (ADR-014), y
            // lo que vino junto se va junto, deshaciendo la importación.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ese gasto vino con el historial importado. Se quita deshaciendo la importación.");
        }
        // Lo dice el sello, no la fecha (V88): un gasto con fecha de hoy pudo haber entrado ya en
        // el cierre del mediodía, y uno de anoche que subió tarde puede estar todavía abierto.
        if (m.estaCerrado()) {
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
        // Los mismos que va a tomar el cierre: sin sello, dentro de la ventana (ContadorDeCaja).
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        java.util.Set<java.util.UUID> abiertos = new java.util.HashSet<>();
        contador.leer(TenantContextHolder.getTenantId(), ahora, ahora.minusDays(DIAS_QUE_MIRA_UN_CIERRE), false)
                .movimientos().forEach(m -> abiertos.add(m.id()));
        if (abiertos.isEmpty()) return List.of();
        return movimientoRepository.findAllById(abiertos).stream()
                .sorted(java.util.Comparator.comparing(com.veltronik.v2.gym.entities.CajaMovimiento::getFecha).reversed())
                .toList();
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
    public List<ContadorDeCaja.Cobro> movimientosDelPeriodo() {
        // EXACTAMENTE lo que va a tomar el cierre: la misma lectura (ContadorDeCaja), sin bloquear.
        // Incluye lo cargado tarde con fecha de un día ya cerrado, que antes no aparecía nunca.
        return leerAbierto().cobros();
    }

    /**
     * Los cobros YA CERRADOS que se corrigieron o se anularon después (V88). Su diferencia entra
     * en el próximo cierre, y la pantalla la muestra antes de cerrar, renglón por renglón.
     */
    @Transactional(readOnly = true)
    public List<ContadorDeCaja.Correccion> correccionesPendientes() {
        return leerAbierto().correcciones();
    }

    private ContadorDeCaja.PorCerrar leerAbierto() {
        return leerAbierto(LocalDateTime.now(BUSINESS_ZONE));
    }

    /** Lo que tomaría un cierre hecho en {@code hasta}, sin bloquear ni sellar. */
    private ContadorDeCaja.PorCerrar leerAbierto(LocalDateTime hasta) {
        return contador.leer(TenantContextHolder.getTenantId(), hasta, hasta.minusDays(DIAS_QUE_MIRA_UN_CIERRE), false);
    }

    /**
     * El cambio que hay en el cajón antes de los cobros de hoy. Lo dejó dicho el cierre
     * anterior; la pantalla lo muestra para que la cuenta del cajón se pueda seguir a mano.
     */
    @Transactional(readOnly = true)
    public BigDecimal fondoActual() {
        return fondoDeHoy();
    }

    /**
     * Balance de ingresos de hoy, o del mes en curso. Lo piden los escritorios que todavía no
     * mandan un rango.
     *
     * @param desdeElPrimeroDelMes true = del 1° del mes a hoy; false = hoy.
     */
    @Transactional(readOnly = true)
    public Balance balance(boolean desdeElPrimeroDelMes) {
        java.time.LocalDate hoy = LocalDateTime.now(BUSINESS_ZONE).toLocalDate();
        return balance(desdeElPrimeroDelMes ? hoy.withDayOfMonth(1) : hoy, hoy);
    }

    /** El tope de un rango: un año y un poco. Más que eso es un pedido que nadie hizo a mano. */
    public static final int DIAS_MAXIMOS_DEL_RANGO = 400;

    /**
     * Balance de un rango de días de CALENDARIO, con los dos extremos adentro. Es el que elige
     * el dueño con el selector (Hoy, Semana, Mes, Año o dos fechas a mano).
     *
     * <p>⭐ <b>Es la pregunta "¿cuánta plata entró?", y la contesta el {@link LibroDeIngresos}</b>
     * —el mismo número del tablero, de Pagos y del Excel—, con el historial importado y las
     * ventas incluidos y marcados aparte. Hasta el 22/09 lo contaba la cuenta del cajón, sin el
     * historial, y el año de un gimnasio recién migrado decía $283.000 mientras el tablero
     * decía millones: dos respuestas a la misma pregunta.</p>
     *
     * <p>No es lo mismo que el cierre, que contesta otra cosa: "¿qué tiene que haber en el
     * cajón?". Esa cuenta sigue sin el historial (esa plata la cobró el otro sistema).</p>
     */
    @Transactional(readOnly = true)
    public Balance balance(java.time.LocalDate desde, java.time.LocalDate hasta) {
        validarRango(desde, hasta);
        UUID gym = TenantContextHolder.getTenantId();
        LibroDeIngresos.Totales ingresos = libro.enLosDias(gym, desde, hasta);

        // Los gastos del rango, que el libro de INGRESOS no mira. Sin el historial importado y
        // sin anulados, como siempre.
        BigDecimal egresosEfectivo = BigDecimal.ZERO;
        BigDecimal egresosOtrosMedios = BigDecimal.ZERO;
        for (var m : movimientoRepository.findByTenantIdAndFechaBetweenOrderByFechaDesc(
                gym, desde.atStartOfDay(), finDelDia(hasta))) {
            if (!m.estaVigente() || m.esImportado() || !m.esEgreso()) continue;
            if (m.afectaElCajon()) egresosEfectivo = egresosEfectivo.add(m.getMonto());
            else egresosOtrosMedios = egresosOtrosMedios.add(m.getMonto());
        }
        return new Balance(desde.atStartOfDay(), finDelDia(hasta), ingresos, egresosEfectivo, egresosOtrosMedios);
    }

    /**
     * Lo que entró en un rango de días (el libro de ingresos) y lo que salió de gastos.
     *
     * @param ingresos por forma de pago y por origen: cuotas, historial importado y otros ingresos.
     */
    public record Balance(LocalDateTime desde, LocalDateTime hasta, LibroDeIngresos.Totales ingresos,
                          BigDecimal egresosEfectivo, BigDecimal egresosOtrosMedios) {
        public BigDecimal total() {
            return ingresos.total();
        }

        public BigDecimal efectivo() {
            return ingresos.efectivo();
        }

        public int cantidadCobros() {
            return ingresos.cantidadCobros();
        }
    }

    /** Un rango que se pueda pedir: las dos puntas, en orden, y no más largo que el tope. */
    public static void validarRango(java.time.LocalDate desde, java.time.LocalDate hasta) {
        if (desde == null || hasta == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Elegí las dos fechas.");
        }
        if (hasta.isBefore(desde)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "La fecha «hasta» es anterior a «desde».");
        }
        if (java.time.temporal.ChronoUnit.DAYS.between(desde, hasta) > DIAS_MAXIMOS_DEL_RANGO) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Elegí un rango de hasta un año.");
        }
    }

    /**
     * El último instante de un día, con MICROsegundos y no nanos.
     *
     * <p>⚠️ No {@code LocalTime.MAX}: son 23:59:59.999999999, y Postgres guarda microsegundos.
     * Al mandarlo, redondea hacia arriba y cae en las 00:00:00 del día siguiente — un cobro
     * hecho justo a medianoche entraría en dos días a la vez. Ya pasó con los cierres de visitas.</p>
     */
    public static LocalDateTime finDelDia(java.time.LocalDate dia) {
        return dia.atTime(23, 59, 59, 999_999_000);
    }

    /**
     * Lo que lleva acumulado el período abierto, sin cerrarlo: lo MISMO que contaría un cierre
     * hecho ahora (la misma lectura, sin bloquear ni sellar).
     */
    @Transactional(readOnly = true)
    public Resumen resumenAbierto() {
        LocalDateTime hasta = LocalDateTime.now(BUSINESS_ZONE);
        return sumar(inicioDelPeriodo(), hasta, leerAbierto(hasta));
    }

    /**
     * Cierra el día.
     *
     * <p><b>Ya no se declara nada.</b> El sistema sabe cuánto entró por efectivo y cuánto
     * por transferencia —cada cobro tiene su forma de pago—, así que lo suma y lo muestra.
     * Lo único que decide una persona es cuánto efectivo se lleva del cajón.</p>
     *
     * <p><b>Lo que esto dejó de hacer, dicho en claro.</b> Hasta el 2026-09-02 el cierre era
     * un ARQUEO A CIEGAS: quien cerraba contaba la plata, escribía el monto sin ver lo
     * esperado, y el sistema calculaba la diferencia. Eso detectaba faltantes; esto no. Fue
     * una decisión del dueño, tomada sabiendo el costo: contar y tipear todos los días
     * también tiene un precio, y el suyo es que la caja no se cierre. Una caja que no se
     * cierra no detecta nada.</p>
     *
     * <p>Las columnas del arqueo viejo se siguen guardando en NULL y {@code conArqueo} en
     * false: los cierres históricos las tienen cargadas y su lista tiene que seguir
     * leyéndose igual.</p>
     *
     * @param retiroEfectivo cuánto se lleva del cajón. NULL o 0 = no se retira nada, todo
     *                       queda para mañana.
     */
    /** El camino con internet: el momento lo pone el servidor y no hay nada que comparar. */
    @Transactional
    public CajaCierre cerrar(BigDecimal retiroEfectivo, String nota, String cerradoPor) {
        return cerrar(retiroEfectivo, nota, cerradoPor, null, null, null, null);
    }

    /**
     * Cierra el día, con el momento en que se cerró de verdad.
     *
     * <p><b>El momento no es un detalle.</b> Un cierre hecho a las 22:00 que sube a las 09:00
     * del día siguiente, sellado con el reloj del servidor, se llevaría puestas las ventas de
     * la mañana siguiente: el período va desde el cierre anterior hasta {@code hasta}, así que
     * mover {@code hasta} mueve qué plata cuenta. Es la regla 4 de la fase 3 — un cierre nunca
     * cuenta plata de otro día, llegue cuando llegue.</p>
     *
     * <p><b>⭐ Y por eso el total no se manda desde el terminal.</b> Como la cola es una sola y
     * respeta el orden, cuando este cierre llega ya subieron todos los cobros de ese día — y
     * el servidor los cuenta ({@link ContadorDeCaja}). El número completo sale gratis
     * del orden estricto; no hay que confiar en la suma del terminal.</p>
     *
     * <p><b>Lo que el terminal manda igual, y para qué.</b> Lo que MOSTRÓ en pantalla. No se
     * usa para calcular nada: se guarda al lado del número del servidor para que una
     * diferencia quede registrada en vez de desaparecer. El terminal cuenta con lo último que
     * bajó más lo que encoló; el servidor ve además lo que entró por el portal o por Mercado
     * Pago durante el corte. Que difieran es información, no un error.</p>
     *
     * @param ocurridoEn cuándo se cerró; {@code null} si lo pone el servidor.
     * @param clientRef  el sello del terminal. Sin él no hay protección contra reintentos.
     */
    @Transactional
    public CajaCierre cerrar(BigDecimal retiroEfectivo, String nota, String cerradoPor,
                             LocalDateTime ocurridoEn, java.util.UUID clientRef,
                             BigDecimal esperadoSegunTerminal, Integer cobrosSegunTerminal) {
        // (0) ¿Ya lo guardamos? Antes de tocar nada — igual que registerScan y que el cobro.
        //
        // Acá un duplicado no deja una fila de más: el período del segundo arranca donde
        // terminó el primero, así que cuenta CERO, y ese cero pasa a ser el fondo de mañana.
        // El error después lo arrastran todos los cierres siguientes.
        UUID gym = TenantContextHolder.getTenantId();
        if (clientRef != null) {
            java.util.Optional<CajaCierre> yaEstaba = cierreRepository.findByTenantIdAndClientRef(gym, clientRef);
            if (yaEstaba.isPresent()) {
                return yaEstaba.get();
            }
        }

        BigDecimal retiro = retiroEfectivo == null ? BigDecimal.ZERO : retiroEfectivo;
        if (retiro.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El retiro no puede ser negativo.");
        }

        // (1) UN CIERRE POR VEZ en cada gimnasio. Dos a la vez (el portal y el escritorio en el
        // mismo minuto) leerían el mismo cierre anterior y el mismo fondo. Todo lo que sigue se
        // lee DESPUÉS del candado, así el segundo ve el cierre del primero.
        contador.candado(gym);
        if (clientRef != null) {
            // El reintento que llegó en paralelo con el original, y esperó el candado.
            java.util.Optional<CajaCierre> yaEstaba = cierreRepository.findByTenantIdAndClientRef(gym, clientRef);
            if (yaEstaba.isPresent()) {
                return yaEstaba.get();
            }
        }

        java.util.Optional<CajaSesion> sesion = sesionAbierta();
        BigDecimal fondo = fondoDeHoy();

        LocalDateTime desde = inicioDelPeriodo();
        LocalDateTime hasta = MomentoDeclarado.acotar(ocurridoEn);

        // ⛔ EL PERÍODO YA ESTABA CERRADO POR OTRO.
        //
        // Pasa cuando un cierre esperó en la cola y, mientras tanto, alguien cerró desde el
        // portal. Guardarlo igual haría un cierre de período vacío o —peor— negativo, y su
        // quedaEnCaja se convertiría en el fondo de mañana.
        //
        // Se contesta 409 y no 500 a propósito: la cola trata los 4xx como definitivos, así
        // que lo SACA en vez de reintentarlo para siempre y taponar todo lo que venga detrás.
        if (!hasta.isAfter(desde)) {
            log.warn("Cierre descartado: su momento ({}) no es posterior al ultimo cierre ({}). "
                    + "Alguien cerro este periodo mientras este esperaba en la cola.", hasta, desde);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ese período ya lo cerró otro. Este cierre no se puede aplicar.");
        }

        // (2) Lo que entra en este cierre, BLOQUEADO hasta que termine: lo que se lee es
        // exactamente lo que después se sella (ver ContadorDeCaja).
        LocalDateTime piso = hasta.minusDays(DIAS_QUE_MIRA_UN_CIERRE);
        ContadorDeCaja.PorCerrar porCerrar = contador.leer(gym, hasta, piso, true);
        Resumen r = sumar(desde, hasta, porCerrar);

        // ⚠️ LOS TÉRMINOS QUE HACEN QUE ESTO CUADRE, Y CADA UNO COSTÓ UN BUG:
        //   · EL FONDO. En el cajón está el cambio de ayer MÁS lo cobrado hoy. Sin sumarlo,
        //     TODOS los cierres daban sobrante por el mismo monto.
        //   · LOS EGRESOS. Del cajón también sale plata. Sin restarlos, el día que se le paga
        //     a la limpieza el cierre decía FALTANTE y acusaba a quien atendió.
        //   · LAS CORRECCIONES (V88). Un cobro en efectivo de ayer que hoy se anula porque se
        //     devolvió la plata: esa plata salió HOY del cajón.
        BigDecimal enElCajon = r.enElCajon(fondo);

        // No se puede sacar del cajón lo que no hay. Sin esto, un dedazo (un cero de más)
        // dejaría el fondo de mañana en negativo y el error viajaría de día en día.
        if (retiro.compareTo(enElCajon) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No podés retirar más de lo que hay en el cajón.");
        }

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
        cierre.setIngresosOtrosMedios(r.ingresosOtrosMedios());
        cierre.setCantidadMovimientos(r.cantidadMovimientos());
        cierre.setAjustesEfectivo(r.ajustesEfectivo());
        cierre.setAjustesOtrosMedios(r.ajustesOtrosMedios());
        cierre.setCantidadAjustes(r.cantidadAjustes());

        // Sin conteo declarado no hay diferencia que calcular. Quedan en NULL a propósito, y
        // no en cero: cero significaría "cuadró perfecto", que es una afirmación que nadie hizo.
        cierre.setConArqueo(false);

        // Lo que vio quien cerró, cuando cerró sin internet. Al lado de lo que calculó el
        // servidor, no en su lugar.
        cierre.setClientRef(clientRef);
        cierre.setEsperadoSegunTerminal(esperadoSegunTerminal);
        cierre.setCobrosSegunTerminal(cobrosSegunTerminal);

        cierre.setRetiroEfectivo(retiro);
        cierre.setQuedaEnCaja(enElCajon.subtract(retiro));
        cierre.setNota(nota != null && !nota.isBlank() ? nota.trim() : null);
        cierre.setCerradoPorNombre(cerradoPor);

        CajaCierre guardado = cierreRepository.saveAndFlush(cierre);

        // (3) EL SELLO. Cada cobro y cada movimiento que contó este cierre queda marcado con él,
        // y ningún otro cierre lo vuelve a contar. Tiene que sellar TODOS los que leyó: si uno
        // no se selló, algo lo tocó en el medio y el número guardado arriba ya no es cierto.
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<UUID> cobros = porCerrar.cobros().stream().map(ContadorDeCaja.Cobro::id).toList();
        List<UUID> movimientos = porCerrar.movimientos().stream().map(ContadorDeCaja.Movimiento::id).toList();
        int sellados = contador.sellarCobros(gym, cobros, guardado.getId(), ahora);
        int movSellados = contador.sellarMovimientos(gym, movimientos, guardado.getId(), ahora);
        if (sellados != cobros.size() || movSellados != movimientos.size()) {
            throw new IllegalStateException("El cierre leyó " + cobros.size() + " cobros y "
                    + movimientos.size() + " movimientos pero selló " + sellados + " y " + movSellados
                    + ". No se guarda: el número no sería cierto.");
        }
        for (ContadorDeCaja.Correccion c : porCerrar.correcciones()) {
            com.veltronik.v2.gym.entities.CajaCierreAjuste a = new com.veltronik.v2.gym.entities.CajaCierreAjuste();
            a.setTenant(tenant);
            a.setCierreId(guardado.getId());
            a.setPaymentId(c.pagoId());
            a.setMetodoAntes(c.metodoAntes());
            a.setMontoAntes(c.montoAntes());
            a.setMetodoDespues(c.metodoDespues());
            a.setMontoDespues(c.montoDespues());
            correccionRepository.save(a);
            contador.resellar(c.pagoId(), c.montoDespues(), c.metodoDespues(), ahora);
        }
        // Lo sin sellar más viejo que la ventana: carga histórica, que ningún arqueo cuenta.
        int historicos = contador.sellarHistoricos(gym, piso, ahora);
        if (historicos > 0) {
            log.info("Cierre {}: {} cobros o movimientos con fecha de hace más de {} días quedaron como "
                    + "carga histórica (no entran al arqueo).", guardado.getId(), historicos, DIAS_QUE_MIRA_UN_CIERRE);
        }

        // ⚠️ Lo que manda el terminal es lo que decía "Hay en el cajón" (fondo + efectivo +
        // ingresos − gastos), así que se compara contra ESA cuenta. Compararlo contra el efectivo
        // cobrado solo hacía saltar el aviso cada vez que había fondo o un gasto: un aviso que
        // salta siempre es un aviso que nadie mira.
        if (esperadoSegunTerminal != null && esperadoSegunTerminal.compareTo(enElCajon) != 0) {
            // No se corrige solo: se hace ruido. Las dos cuentas quedan guardadas y esta línea
            // es la que permite encontrar el caso sin ir a buscarlo fila por fila.
            log.warn("Cierre {} con dos cuentas distintas: el terminal mostro {} en el cajon y "
                            + "el servidor conto {}. Cobros: terminal {}, servidor {}.",
                    guardado.getId(), esperadoSegunTerminal, enElCajon,
                    cobrosSegunTerminal, r.cantidadCobros());
        }

        // Si venía una sesión del modelo viejo, se cierra con el mismo acto: dejarla abierta
        // haría que el índice único bloqueara para siempre cualquier apertura futura.
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
    /**
     * Desde cuándo cuenta el período abierto: desde el último cierre, siempre.
     *
     * <p>Antes esto miraba primero si había una caja ABIERTA y contaba desde la apertura.
     * Con el cierre diario ya no se abre nada (ver {@link #fondoDeHoy()}), y contar desde el
     * último cierre tiene una propiedad que la apertura no tenía: <b>ningún cobro puede
     * quedar fuera de un cierre</b>. Con el modelo viejo, lo cobrado entre el cierre de
     * anoche y la apertura de la mañana no lo contaba nadie — y eso pasaba justo los días
     * en que alguien se olvidaba de abrir, que eran los días de apuro.</p>
     *
     * <p>Si nadie cerró ayer, el período de hoy arrastra los dos días. Es lo correcto: la
     * plata está toda en el mismo cajón.</p>
     */
    private LocalDateTime inicioDelPeriodo() {
        return desdeElUltimoCierre();
    }

    /**
     * El cambio que hay en el cajón antes de empezar a cobrar hoy.
     *
     * <p><b>Lo dice el cierre anterior, no una persona.</b> Lo que se decidió dejar en el
     * cajón al cerrar ayer es exactamente el fondo de hoy: es la misma plata, nadie la
     * movió. Por eso el paso de "abrir caja" declarando el cambio dejó de existir — era
     * pedirle a alguien que a la mañana recordara un número que el sistema ya sabía, y el
     * día que se olvidaba, el arqueo daba sobrante por el monto del cambio.</p>
     *
     * <p>El {@code orElseGet} es la transición: los cierres anteriores al 2026-09-02 no
     * tienen {@code quedaEnCaja} porque el modelo no existía. Mientras el último cierre sea
     * uno de esos, se respeta el fondo de la sesión abierta (el modelo viejo). Después del
     * primer cierre diario, esa rama no se usa nunca más.</p>
     */
    private BigDecimal fondoDeHoy() {
        return ultimo()
                .map(CajaCierre::getQuedaEnCaja)
                .orElseGet(() -> sesionAbierta().map(CajaSesion::getFondoInicial).orElse(BigDecimal.ZERO));
    }

    private LocalDateTime desdeElUltimoCierre() {
        return cierreRepository.findTopByTenantIdOrderByHastaDesc(TenantContextHolder.getTenantId())
                .map(CajaCierre::getHasta)
                .orElseGet(() -> LocalDateTime.now(BUSINESS_ZONE).minusDays(DIAS_QUE_MIRA_UN_CIERRE));
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    /**
     * Suma lo que entra en un cierre: los cobros por forma de pago, las correcciones de días ya
     * cerrados, y los gastos e ingresos de caja.
     *
     * <p>Una sola cuenta para las tres lecturas de la caja —el resumen de la pantalla, el cierre y
     * lo que ve el terminal sin internet (que parte de este mismo número)—. La lectura la hace
     * {@link ContadorDeCaja}, con el mismo {@code WHERE} en las tres.</p>
     *
     * <p>El historial importado no llega hasta acá (ADR-014): {@code ContadorDeCaja} no lo lee,
     * porque esa plata la cobró el sistema anterior y ya se rindió allá.</p>
     */
    static Resumen sumar(LocalDateTime desde, LocalDateTime hasta, ContadorDeCaja.PorCerrar porCerrar) {
        BigDecimal efectivo = BigDecimal.ZERO;
        BigDecimal transferencia = BigDecimal.ZERO;
        BigDecimal mercadopago = BigDecimal.ZERO;
        BigDecimal tarjeta = BigDecimal.ZERO;
        BigDecimal otros = BigDecimal.ZERO;

        for (ContadorDeCaja.Cobro c : porCerrar.cobros()) {
            BigDecimal monto = c.monto() != null ? c.monto() : BigDecimal.ZERO;
            switch (MetodoDePago.normalizar(c.metodo())) {
                case MetodoDePago.EFECTIVO -> efectivo = efectivo.add(monto);
                case MetodoDePago.TRANSFERENCIA -> transferencia = transferencia.add(monto);
                case MetodoDePago.MERCADO_PAGO -> mercadopago = mercadopago.add(monto);
                case MetodoDePago.TARJETA -> tarjeta = tarjeta.add(monto);
                default -> otros = otros.add(monto);
            }
        }

        // ─── Las correcciones de cobros ya cerrados (V88) ───
        //
        // Lo que vale hoy menos lo que contó su cierre, del lado de la forma de pago en que está
        // cada uno: pasar $10.000 de efectivo a transferencia saca $10.000 del cajón y los pone
        // en el banco, y el total no cambia.
        BigDecimal ajustesEfectivo = BigDecimal.ZERO;
        BigDecimal ajustesOtrosMedios = BigDecimal.ZERO;
        for (ContadorDeCaja.Correccion c : porCerrar.correcciones()) {
            BigDecimal antes = c.montoAntes() != null ? c.montoAntes() : BigDecimal.ZERO;
            BigDecimal despues = c.montoDespues() != null ? c.montoDespues() : BigDecimal.ZERO;
            if (MetodoDePago.esEfectivo(c.metodoAntes())) ajustesEfectivo = ajustesEfectivo.subtract(antes);
            else ajustesOtrosMedios = ajustesOtrosMedios.subtract(antes);
            if (MetodoDePago.esEfectivo(c.metodoDespues())) ajustesEfectivo = ajustesEfectivo.add(despues);
            else ajustesOtrosMedios = ajustesOtrosMedios.add(despues);
        }

        // ─── Lo que entró y salió del cajón sin ser un cobro ───
        //
        // ⚠️ SOLO EL EFECTIVO MUEVE EL CAJÓN. Un pago al proveedor por transferencia se anota —el
        // dueño quiere verlo— pero no toca el arqueo. Una venta por transferencia tampoco toca el
        // cajón, pero es plata que entró: va en su propio renglón (ingresosOtrosMedios).
        //
        // Y los anulados no suman: para eso se anulan (se sellan igual, para que el cierre diga
        // que los vio).
        BigDecimal egresos = BigDecimal.ZERO;
        BigDecimal ingresosEfectivo = BigDecimal.ZERO;
        BigDecimal ingresosOtrosMedios = BigDecimal.ZERO;
        int cuantosMovimientos = 0;
        for (ContadorDeCaja.Movimiento m : porCerrar.movimientos()) {
            if (!m.vigente()) continue;
            cuantosMovimientos++;
            BigDecimal monto = m.monto() != null ? m.monto() : BigDecimal.ZERO;
            boolean esEgreso = com.veltronik.v2.gym.entities.CajaMovimiento.EGRESO.equalsIgnoreCase(m.tipo());
            boolean enEfectivo = MetodoDePago.esEfectivo(m.metodo());
            if (esEgreso) {
                if (enEfectivo) egresos = egresos.add(monto);
            } else if (enEfectivo) {
                ingresosEfectivo = ingresosEfectivo.add(monto);
            } else {
                ingresosOtrosMedios = ingresosOtrosMedios.add(monto);
            }
        }

        return new Resumen(desde, hasta, efectivo, transferencia, mercadopago, tarjeta, otros,
                porCerrar.cobros().size(), egresos, ingresosEfectivo, cuantosMovimientos,
                ingresosOtrosMedios, ajustesEfectivo, ajustesOtrosMedios, porCerrar.correcciones().size());
    }

    /**
     * Lo que el sistema contó en un período.
     *
     * @param ingresosEfectivo    ventas, aportes y otros ingresos en efectivo: entran al cajón
     * @param ingresosOtrosMedios ventas y otros ingresos por transferencia, MP o tarjeta
     * @param ajustesEfectivo     correcciones de cobros ya cerrados que mueven el cajón
     *                            (negativo = salió plata, por ejemplo una devolución)
     * @param ajustesOtrosMedios  lo mismo, de los otros medios
     */
    public record Resumen(LocalDateTime desde, LocalDateTime hasta,
                          BigDecimal efectivo, BigDecimal transferencia,
                          BigDecimal mercadopago, BigDecimal tarjeta,
                          BigDecimal otros, int cantidadCobros,
                          BigDecimal egresosEfectivo, BigDecimal ingresosEfectivo,
                          int cantidadMovimientos,
                          BigDecimal ingresosOtrosMedios,
                          BigDecimal ajustesEfectivo, BigDecimal ajustesOtrosMedios, int cantidadAjustes) {

        /** Sin correcciones ni ventas por otros medios: los cierres de antes de la V88. */
        public Resumen(LocalDateTime desde, LocalDateTime hasta,
                       BigDecimal efectivo, BigDecimal transferencia,
                       BigDecimal mercadopago, BigDecimal tarjeta,
                       BigDecimal otros, int cantidadCobros,
                       BigDecimal egresosEfectivo, BigDecimal ingresosEfectivo,
                       int cantidadMovimientos) {
            this(desde, hasta, efectivo, transferencia, mercadopago, tarjeta, otros, cantidadCobros,
                    egresosEfectivo, ingresosEfectivo, cantidadMovimientos,
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0);
        }

        /** Transferencias y Mercado Pago juntos: es lo que se revisa de una sola mirada. */
        public BigDecimal digital() {
            return transferencia.add(mercadopago);
        }

        /** Todo lo cobrado a socios en el período, por el medio que sea. */
        public BigDecimal cobrado() {
            return efectivo.add(transferencia).add(mercadopago).add(tarjeta).add(otros);
        }

        /**
         * Lo que TIENE que haber en el cajón.
         *
         * <p>La cuenta completa, y cada término está por un motivo que costó encontrar:</p>
         * <pre>
         *   fondo inicial          el cambio de ayer — sin esto todo daba SOBRANTE siempre
         * + cobrado en efectivo    lo que entró por la ventanilla
         * + ingresos en efectivo   plata que entró sin ser un cobro (una venta suelta)
         * - egresos en efectivo    lo que salió — sin esto todo daba FALTANTE siempre
         * ± correcciones           un cobro de ayer anulado hoy porque se devolvió la plata
         * </pre>
         *
         * <p>Vive acá y no repartida en la pantalla y el servicio: una cuenta de plata copiada
         * en dos lados es una cuenta que en algún lado va a estar mal.</p>
         */
        public BigDecimal enElCajon(BigDecimal fondo) {
            return (fondo == null ? BigDecimal.ZERO : fondo)
                    .add(efectivo)
                    .add(ingresosEfectivo)
                    .subtract(egresosEfectivo)
                    .add(ajustesEfectivo == null ? BigDecimal.ZERO : ajustesEfectivo);
        }
    }
}
