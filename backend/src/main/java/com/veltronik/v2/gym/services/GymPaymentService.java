package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.CoverageGapDTO;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.entities.GymPaymentAjuste;
import com.veltronik.v2.gym.repositories.GymPaymentAjusteRepository;
import com.veltronik.v2.gym.entities.GymPlan;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class GymPaymentService {

    /** Zona del negocio (Argentina): "hoy" es hora AR, no la del server. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    private final GymPaymentRepository repository;
    private final GymMemberService memberService;
    private final GymPlanService planService;
    private final GymPaymentAjusteRepository ajusteRepository;

    public GymPaymentService(GymPaymentRepository repository, GymMemberService memberService,
                             GymPlanService planService, GymPaymentAjusteRepository ajusteRepository) {
        this.repository = repository;
        this.memberService = memberService;
        this.planService = planService;
        this.ajusteRepository = ajusteRepository;
    }

    public List<GymPayment> findAllForCurrentTenant() {
        return repository.findByTenantId(TenantContextHolder.getTenantId());
    }

    /**
     * Pagos del tenant en un rango de fechas (ambos opcionales). Las fechas llegan como
     * día calendario ({@link LocalDate}) desde el frontend; acá se expanden a
     * {@link LocalDateTime}: {@code from} → 00:00:00 de ese día, {@code to} → 23:59:59
     * (fin de día inclusivo, así no se recorta el último día). Si ambos son null,
     * equivale a "todos" (mismo resultado que findAllForCurrentTenant).
     */
    public List<GymPayment> findForCurrentTenantByDateRange(LocalDate from, LocalDate to) {
        // Sin fechas → todos (sin filtro). Con fechas → bordes CONCRETOS, nunca null: el patrón
        // ':param IS NULL OR ...' rompía con JDBC exception (400) en Hibernate 6 + PostgreSQL,
        // dejando Pagos/Reportes en blanco. Con centinelas el query queda un >= AND <= limpio.
        if (from == null && to == null) {
            return findAllForCurrentTenant();
        }
        LocalDateTime fromDt = (from != null) ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        // ⚠️ No LocalTime.MAX: son nanosegundos, Postgres redondea a microsegundos y el "hasta"
        // caía en las 00:00 del día siguiente. Septiembre traía los cobros del 1° de octubre
        // cargados desde el modal de Pagos, que los guardaba justo a las 00:00.
        LocalDateTime toDt = (to != null) ? CajaService.finDelDia(to) : LocalDateTime.of(2999, 12, 31, 23, 59, 59);
        return repository.findByTenantIdAndDateRange(TenantContextHolder.getTenantId(), fromDt, toDt);
    }

    /** Historial de pagos de un socio, acotado al tenant actual (aislamiento garantizado). */
    public List<GymPayment> findByMemberIdForCurrentTenant(UUID memberId) {
        return repository.findByTenantIdAndMemberId(TenantContextHolder.getTenantId(), memberId);
    }
    
    public GymPayment saveForCurrentTenant(GymPayment payment) {
        // ⭐⭐ ANTES DE TOCAR NADA: ¿ESTE COBRO YA SE GUARDÓ?
        //
        // El mostrador puede cobrar sin internet y mandar cuando vuelve. Si el pedido salió,
        // el servidor lo guardó y la respuesta se perdió en el camino de vuelta, el reintento
        // llega con el mismo sello — y hay que devolver el que ya está, sin ejecutar nada.
        //
        // ⚠️ Y el "sin ejecutar nada" es lo importante, no el registro duplicado.
        // `aplicarPeriodoDelPlan` arranca el período DONDE TERMINA la cobertura vigente del
        // socio, así que procesarlo de nuevo arrancaría donde terminó la primera vez: el socio
        // se lleva 30 días GRATIS y el ingreso queda contado dos veces en el arqueo. Es el
        // mismo patrón que `AccessLogService.registerScan`, y por el mismo motivo: en esta
        // clase de operación el daño no es la fila de más, es el efecto lateral.
        //
        // Esta consulta es la mitad BARATA de la garantía. La que de verdad garantiza es el
        // índice único parcial de la V63: entre este SELECT y el INSERT hay una ventana, y dos
        // vaciados en paralelo pasan por ella.
        if (payment.getClientRef() != null && payment.getId() == null) {
            java.util.Optional<GymPayment> yaEstaba = repository.findByTenantIdAndClientRef(
                    TenantContextHolder.getTenantId(), payment.getClientRef());
            if (yaEstaba.isPresent()) return yaEstaba.get();
        }

        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        payment.setTenant(tenant);

        // Una sola caja para el estado, decidida acá y no por quien mande la request.
        // Convivían "PAID" (default de la entidad) y "paid" (lo que manda el frontend) en
        // la misma columna, y la suma de ingresos del Dashboard comparaba exacto contra
        // 'PAID' → no contaba nada de lo cargado desde la app.
        normalizarEstado(payment);
        validarPlata(payment);

        // ⭐ UN COBRO IMPORTADO ES HISTORIA, Y EDITARLO NO LO CONVIERTE EN COBRO (ADR-014).
        //
        // Solo llega acá por la edición (PUT): la importación escribe por su lado. Sin esta
        // guarda, corregirle el monto a un cobro de ControlFit de marzo pasaba por el camino
        // de abajo —sin arancel y sin período, "el mes corre solo"— y le daba al socio un mes
        // desde HOY: el mismo error del 31/08, disparado por un clic en "Editar".
        //
        // Nunca cubre un período (la V86 lo exige con un CHECK), así que tampoco se acepta el
        // que venga escrito en la edición.
        if (payment.esImportado()) {
            payment.setPeriodStart(null);
            payment.setPeriodEnd(null);
            return repository.save(payment);
        }

        // Ensure the member belongs to the tenant
        GymMember member = null;
        if (payment.getMember() != null && payment.getMember().getId() != null) {
            member = memberService.findByIdAndVerifyOwnership(payment.getMember().getId());
            payment.setMember(member);
        }

        // ── El arancel manda sobre el período ──
        //
        // Si el cobro trae un arancel, la cobertura la define el PLAN, no lo que haya escrito
        // quien atiende. Antes el período se tipeaba a mano en cada cobro, y olvidarse de
        // correr el "hasta" al vender un trimestral dejaba al socio con un mes — sin que nadie
        // se enterara hasta que no lo dejaban entrar.
        //
        // Se resuelve ANTES de guardar para que el pago quede grabado con el período que
        // realmente se le va a aplicar al socio: si el pago dijera una cosa y la cobertura
        // otra, tendríamos otra vez dos verdades para el mismo hecho.
        // ⭐⭐ EL MES CORRE SOLO, HAYA ARANCEL O NO (ADR-013).
        //
        // Antes la cobertura salía EXCLUSIVAMENTE del arancel: un cobro sin arancel —"monto a
        // mano", que es lo que el mostrador usa todo el tiempo— no movía el vencimiento ni un
        // día. La plata entraba a la caja y el socio seguía vencido, sin que nadie se enterara
        // hasta que no lo dejaban entrar.
        //
        // Lo dijo el dueño: "lo que hace que el alumno venza es EL MES, simple. Los aranceles
        // son para saber qué tipo de entrenamiento eligió". Así que el arancel es una etiqueta
        // que PUEDE decir otra cosa —dos meses, una semana, no cubre tiempo—, y cuando no dice
        // nada, la cuota corre un mes.
        //
        // ⚠️ Solo cuando el cobro entra de verdad. Un pago pendiente o anulado no corre nada:
        // esa comprobación vive en `extenderCobertura`, que es el único lugar que la hace.
        if (payment.getPlan() != null && payment.getPlan().getId() != null) {
            GymPlan plan = planService.findByIdAndVerifyOwnership(payment.getPlan().getId());
            payment.setPlan(plan);
            aplicarPeriodoDelPlan(payment, plan, member);
        } else if (payment.getPeriodEnd() == null) {
            // Sin arancel: un mes. Se respeta el período si quien carga el pago lo trajo
            // escrito —el portal deja hacerlo— porque ahí alguien ya decidió a mano.
            aplicarPeriodoDelPlan(payment, null, member);
        }

        GymPayment saved = repository.save(payment);
        extenderCobertura(saved, member);
        return saved;
    }

    /**
     * Calcula el período que cubre este pago a partir del arancel.
     *
     * <p>Arranca donde termina la cobertura vigente del socio —no "hoy"—: el que paga el 25
     * teniendo cuota hasta el 30 no pierde esos cinco días, se le suman. Si está vencido o es
     * nuevo, arranca hoy.</p>
     *
     * <p>Un arancel de 0 días (un pack de clases sueltas) no toca el período: solo suma
     * visitas. Por eso el período queda en null y {@code aplicarCobertura} no mueve la fecha.</p>
     */
    private void aplicarPeriodoDelPlan(GymPayment payment, GymPlan plan, GymMember member) {
        int cantidad = (plan == null) ? 1 : plan.getCoberturaCantidad();
        String unidad = (plan == null) ? "MES" : plan.getCoberturaUnidad();

        // 0 = no cubre tiempo. Es la clase suelta o el pase diario: cobra plata y no corre la
        // fecha. Va explícito en el arancel, no escondido en un cero como estaba antes.
        if (cantidad <= 0) return;

        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime vigente = (member != null) ? member.getMembershipEnd() : null;
        LocalDateTime desde = (vigente != null && vigente.isAfter(ahora)) ? vigente : ahora;

        // ⭐ SUMAR MESES, NO DÍAS, Y LA DIFERENCIA NO ES COSMÉTICA.
        //
        // La regla del negocio es "el mismo día del mes que viene": paga el 7 de marzo, vence
        // el 7 de abril. Con días eso era el 6, y el 7 de febrero más 30 caía el 9 de marzo. En
        // un año son 360 días en vez de 365 — el socio paga doce veces y le faltan cinco.
        //
        // `plusMonths` recorta solo al último día que existe: quien paga un 31 de enero vence
        // el 28 (o 29) de febrero, que es lo que la gente espera y lo que hace todo el mundo.
        payment.setPeriodStart(desde);
        payment.setPeriodEnd("MES".equals(unidad)
                ? desde.plusMonths(cantidad)
                : desde.plusDays(cantidad));
    }

    /**
     * Cobrar una cuota corre la fecha de vencimiento del socio.
     *
     * <p><b>Por qué está acá y no en el navegador.</b> Hasta ahora esto lo hacía el
     * frontend en dos pasos: guardaba el pago y después, en una request aparte, le movía
     * la fecha al socio. Ese segundo paso estaba envuelto en un catch vacío con el
     * comentario "best-effort: la membresía se puede ajustar a mano". O sea: si se cortaba
     * la conexión entre las dos llamadas, <b>el pago quedaba registrado y el socio seguía
     * figurando como vencido, sin que nadie se enterara</b>.</p>
     *
     * <p>Hoy eso lo tapa el criterio humano: la recepcionista ve rojo, se acuerda de que
     * Juan pagó y lo deja pasar. Con un molinete no hay criterio que valga — el socio pagó
     * y la puerta no se abre. Por eso pasa a ser una sola operación: o se guardan el pago
     * y la cobertura, o no se guarda nada.</p>
     *
     * <p><b>Solo hacia adelante.</b> Un pago correctivo o cargado tarde jamás puede
     * ACORTAR una membresía vigente: si el período que cubre termina antes de lo que el
     * socio ya tenía, no se toca nada. Registrar un pago viejo no puede dejar a alguien
     * afuera.</p>
     */
    private void extenderCobertura(GymPayment payment, GymMember member) {
        if (member == null) return;                       // pago sin socio: nada que extender
        if (!estaCobrado(payment.getStatus())) return;    // pendiente o anulado: la plata no entró
        aplicarCobertura(member, payment.getPeriodEnd());
    }

    /**
     * Mueve la cobertura del socio hasta {@code hasta}, si eso lo deja mejor de lo que estaba.
     *
     * <p>Único lugar donde se toca {@code membershipEnd} por cobro. Lo usan los dos caminos
     * —el pago normal y la corrección manual de un socio que pagó y quedó figurando
     * vencido— justamente para que no haya dos criterios: si la pantalla de revisión
     * arreglara con una regla distinta a la del cobro, tendríamos el mismo problema que
     * teníamos con el estado del pago, pero con fechas de membresía.</p>
     *
     * @return true si efectivamente se movió la fecha
     */
    private boolean aplicarCobertura(GymMember member, LocalDateTime hasta) {
        if (hasta == null) return false;                  // sin período: no dice hasta cuándo cubre

        LocalDateTime vigente = member.getMembershipEnd();
        if (vigente != null && !hasta.isAfter(vigente)) return false; // nunca hacia atrás

        member.setMembershipEnd(hasta);
        // Reactivar va ATADO a la extensión, no al pago: si el pago no corrió la fecha
        // (era viejo), tampoco tiene por qué revivir a alguien que el dueño dio de baja.
        member.setActive(true);
        memberService.saveForCurrentTenant(member);
        return true;
    }

    // ── Revisión de los pagos que quedaron huérfanos ───────────────────────────────

    /**
     * Socios que pagaron más allá de la fecha hasta la que figuran cubiertos.
     * Es el "para revisar" que dejó el bug de los dos pasos; ver {@link CoverageGapDTO}.
     */
    @Transactional(readOnly = true)
    public List<CoverageGapDTO> findCoverageGaps() {
        return repository.findCoverageGaps(TenantContextHolder.getTenantId()).stream()
                .map(GymPaymentService::toCoverageGap)
                .toList();
    }

    private static CoverageGapDTO toCoverageGap(GymPaymentRepository.CoverageGapProjection p) {
        CoverageGapDTO dto = new CoverageGapDTO();
        dto.setMemberId(p.getMemberId());
        dto.setMemberName((safe(p.getFirstName()) + " " + safe(p.getLastName())).trim());
        dto.setMembershipEnd(p.getMembershipEnd());
        dto.setPaidUntil(p.getPaidUntil());
        // Días que se le deben. Sin fecha de cobertura, se cuenta desde HOY: no tiene
        // sentido decir "se le deben 4000 días" porque el socio nunca tuvo vencimiento.
        LocalDateTime desde = p.getMembershipEnd() != null ? p.getMembershipEnd() : LocalDateTime.now(BUSINESS_ZONE);
        dto.setDaysOwed(Math.max(0, ChronoUnit.DAYS.between(desde, p.getPaidUntil())));
        return dto;
    }

    private static String safe(String value) {
        return value != null ? value : "";
    }

    /**
     * Corrige a UN socio: le pone la fecha hasta la que realmente pagó.
     *
     * <p>Deliberadamente de a uno y a pedido del dueño. Corregir en masa y automático
     * sonaba tentador, pero son fechas de membresía de gente real: si el sistema se
     * equivoca, le regala meses a alguien o se los saca, y nadie se entera.</p>
     *
     * <p>Usa la misma regla que el cobro (solo hacia adelante), así que llamarlo dos veces
     * es inofensivo y no puede acortarle la membresía a nadie.</p>
     *
     * @return la fecha que quedó, o null si no había nada que corregir
     */
    public LocalDateTime fixCoverage(UUID memberId) {
        GymMember member = memberService.findByIdAndVerifyOwnership(memberId);
        LocalDateTime paidUntil = repository.findPaidUntil(TenantContextHolder.getTenantId(), memberId);
        return aplicarCobertura(member, paidUntil) ? member.getMembershipEnd() : null;
    }

    /**
     * Deja el estado del pago en minúscula, que es la caja canónica (la que el frontend
     * escribe y lee). Un estado vacío se trata como cobrado, igual que el default de la
     * entidad: registrar un pago sin decir nada significa que la plata entró.
     */
    private static void normalizarEstado(GymPayment payment) {
        String status = payment.getStatus();
        payment.setStatus((status == null || status.isBlank()) ? "paid" : status.trim().toLowerCase());
    }

    /**
     * ¿Este pago significa que la plata entró?
     *
     * <p>Sigue sin distinguir mayúsculas aunque ahora se normalice al guardar: este método
     * también se usa sobre pagos que ya estaban en la base desde antes, con la caja que les
     * haya tocado.</p>
     */
    private static boolean estaCobrado(String status) {
        return status != null && "paid".equalsIgnoreCase(status.trim());
    }
    
    /**
     * Edita un cobro. Es un parche: solo cambia lo que viene.
     *
     * <p>⭐ <b>EDITAR NO ES COBRAR DE NUEVO, y hasta el 2026-09-22 lo era.</b> La edición pasaba
     * por {@link #saveForCurrentTenant}, que a un cobro con arancel le recalcula el período
     * arrancando donde termina la cobertura del socio — que ya incluía ESTE cobro. Corregir la
     * nota de la cuota de septiembre le daba al socio octubre gratis, y cada edición, otro mes.
     * Ahora el período se calcula solo cuando el cobro PASA a cobrado (un pendiente que se paga),
     * que es cuando la plata entra de verdad.</p>
     *
     * <p>Un cobro YA CERRADO en la caja se puede corregir igual: la diferencia entra en el
     * próximo cierre como corrección, a la vista (V88). Uno anulado, no: está anulado.</p>
     */
    @Transactional
    public GymPayment actualizar(UUID id, Cambios cambios, String hechoPor) {
        GymPayment p = findByIdAndVerifyOwnership(id);
        if (p.estaAnulado()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ese cobro está anulado. Si la plata entró, registrá un cobro nuevo.");
        }
        // Pasarlo a "anulado" desde la edición es anular: con su rastro y su vencimiento.
        if (cambios.status() != null && GymPayment.ANULADO.equalsIgnoreCase(cambios.status().trim())) {
            return anular(id, null, hechoPor).pago();
        }

        // Foto del ANTES, para anotar qué cambió. Se copia a mano: la entidad de JPA es la misma
        // instancia que se está por modificar.
        GymPayment antes = new GymPayment();
        antes.setId(p.getId());
        antes.setAmount(p.getAmount());
        antes.setPaymentMethod(p.getPaymentMethod());
        antes.setStatus(p.getStatus());
        antes.setMember(p.getMember());
        antes.setPaymentDate(p.getPaymentDate());
        boolean estabaCobrado = p.estaCobrado();

        if (cambios.amount() != null) p.setAmount(cambios.amount());
        if (cambios.paymentDate() != null) p.setPaymentDate(cambios.paymentDate());
        if (cambios.paymentMethod() != null) p.setPaymentMethod(cambios.paymentMethod());
        if (cambios.status() != null) p.setStatus(cambios.status());
        if (cambios.notes() != null) p.setNotes(cambios.notes());
        if (cambios.periodStart() != null) p.setPeriodStart(cambios.periodStart());
        if (cambios.periodEnd() != null) p.setPeriodEnd(cambios.periodEnd());
        normalizarEstado(p);
        validarPlata(p);

        if (p.esImportado()) {
            // Historia: nunca cubre un período (V86, ADR-014), se edite lo que se edite.
            p.setPeriodStart(null);
            p.setPeriodEnd(null);
            GymPayment guardado = repository.save(p);
            anotarEdicion(antes, guardado, hechoPor);
            return guardado;
        }

        GymMember member = p.getMember() != null && p.getMember().getId() != null
                ? memberService.findByIdAndVerifyOwnership(p.getMember().getId()) : null;

        // Recién ahora entra la plata: el período se calcula como en un cobro nuevo.
        if (!estabaCobrado && p.estaCobrado()) {
            if (p.getPlan() != null && p.getPlan().getId() != null) {
                aplicarPeriodoDelPlan(p, planService.findByIdAndVerifyOwnership(p.getPlan().getId()), member);
            } else if (cambios.periodEnd() == null) {
                aplicarPeriodoDelPlan(p, null, member);
            }
        }

        GymPayment guardado = repository.save(p);
        // Solo hacia adelante y sin repetir: si el período no cambió, la cobertura ya lo tenía.
        extenderCobertura(guardado, member);
        anotarEdicion(antes, guardado, hechoPor);
        return guardado;
    }

    /** Lo que se puede cambiar de un cobro. {@code null} = no se toca. */
    public record Cambios(java.math.BigDecimal amount, LocalDateTime paymentDate, String paymentMethod,
                          String status, String notes, LocalDateTime periodStart, LocalDateTime periodEnd) { }

    /**
     * ⭐ ANULA un cobro. No lo borra.
     *
     * <p>Borrar era borrar la prueba: la plata desaparecía de los ingresos y del cierre sin dejar
     * el renglón, y el socio seguía figurando al día. Anulado queda en la lista —tachado, con
     * quién, cuándo y por qué—, deja de sumar en todas partes (ninguna suma cuenta
     * {@code cancelled}), y si ya había entrado en un cierre de caja, el próximo cierre lo
     * descuenta como corrección (V88).</p>
     *
     * <p><b>Y le devuelve al socio el vencimiento que tenía</b>, cuando se puede hacer exacto: si
     * este cobro fue el que le corrió la fecha (su fin de período es el vencimiento de hoy), la
     * fecha vuelve a donde estaba antes de este cobro. Si después hubo otro cobro que la corrió
     * más, no se toca: rehacer la cadena sería adivinar.</p>
     */
    @Transactional
    public Anulacion anular(UUID id, String motivo, String hechoPor) {
        GymPayment p = findByIdAndVerifyOwnership(id);
        if (p.estaAnulado()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese cobro ya estaba anulado.");
        }
        boolean estabaCobrado = p.estaCobrado();
        String resumen = resumirCobro(p);

        p.setStatus(GymPayment.ANULADO);
        p.setAnuladoAt(LocalDateTime.now(BUSINESS_ZONE));
        p.setAnuladoPorNombre(recortar(hechoPor, 160));
        p.setMotivoAnulacion(motivo != null && !motivo.isBlank() ? recortar(motivo.trim(), 255) : null);

        LocalDateTime vuelveA = null;
        if (estabaCobrado && !p.esImportado() && p.getMember() != null && p.getMember().getId() != null
                && p.getPeriodEnd() != null && p.getPeriodStart() != null) {
            GymMember m = memberService.findByIdAndVerifyOwnership(p.getMember().getId());
            if (p.getPeriodEnd().equals(m.getMembershipEnd())) {
                m.setMembershipEnd(p.getPeriodStart());
                memberService.saveForCurrentTenant(m);
                vuelveA = p.getPeriodStart();
            }
        }

        anotar(p.getId(), GymPaymentAjuste.ANULACION, null, resumen, p.getMotivoAnulacion(), hechoPor);
        return new Anulacion(repository.save(p), vuelveA);
    }

    /** @param vencimientoRestaurado el vencimiento que volvió a tener el socio, o null si no se tocó. */
    public record Anulacion(GymPayment pago, LocalDateTime vencimientoRestaurado) { }

    /**
     * La plata tiene que ser plata: un monto mayor a cero, con centavos como mucho, y una forma
     * de pago que se entienda.
     *
     * <p>La base lo exige también (V88), pero ahí el error es un 500 que nadie entiende. Acá es un
     * mensaje. Un cobro negativo no es una devolución —eso es anular—: es un número mal escrito
     * que restaría en todos los totales.</p>
     */
    private static void validarPlata(GymPayment p) {
        if (p.getAmount() == null || p.getAmount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto tiene que ser mayor a cero.");
        }
        if (p.getAmount().stripTrailingZeros().scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto tiene más de dos decimales.");
        }
        if (com.veltronik.v2.gym.entities.MetodoDePago.reconocer(p.getPaymentMethod()) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No conozco la forma de pago «" + p.getPaymentMethod() + "».");
        }
        String estado = p.getStatus();
        if (!GymPayment.COBRADO.equals(estado) && !GymPayment.PENDIENTE.equals(estado)
                && !GymPayment.ANULADO.equals(estado)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El estado del cobro no es válido.");
        }
    }

    public GymPayment findByIdAndVerifyOwnership(UUID id) {
        GymPayment payment = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pago de gym no encontrado"));
                
        if (!payment.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este pago");
        }
        return payment;
    }
    
    /**
     * El "borrar" de los escritorios viejos. <b>Ya no borra: anula</b> (V88).
     *
     * <p>Los escritorios instalados siguen mandando DELETE. Borrar de verdad sacaba la plata de
     * un cierre ya hecho sin dejar el renglón; anular deja el cobro tachado, y si ya estaba
     * cerrado, el próximo cierre lo descuenta a la vista.</p>
     */
    @Transactional
    public void deleteAndVerifyOwnership(UUID id, String hechoPor) {
        GymPayment payment = findByIdAndVerifyOwnership(id);
        if (payment.estaAnulado()) return; // borrar dos veces lo mismo no es un error
        anular(id, "Borrado desde una versión anterior de la app", hechoPor);
    }

    /** Firma vieja, para los llamadores que todavía no pasan el nombre. */
    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        deleteAndVerifyOwnership(id, null);
    }

    /**
     * Anota que un cobro cambió, campo por campo.
     *
     * <p>Solo se comparan los campos que MUEVEN PLATA: monto, método, estado y socio.
     * Corregir una nota o la fecha no es sospechoso, y anotarlo sería ruido que hace que
     * nadie mire la lista.</p>
     */
    @Transactional
    public void anotarEdicion(GymPayment antes, GymPayment despues, String hechoPor) {
        comparar(antes.getId(), "monto", texto(antes.getAmount()), texto(despues.getAmount()), hechoPor);
        comparar(antes.getId(), "método", antes.getPaymentMethod(), despues.getPaymentMethod(), hechoPor);
        comparar(antes.getId(), "estado", antes.getStatus(), despues.getStatus(), hechoPor);
        comparar(antes.getId(), "socio",
                antes.getMember() != null ? String.valueOf(antes.getMember().getId()) : null,
                despues.getMember() != null ? String.valueOf(despues.getMember().getId()) : null,
                hechoPor);
    }

    private void comparar(UUID pagoId, String campo, String antes, String despues, String hechoPor) {
        String a = antes == null ? "" : antes;
        String d = despues == null ? "" : despues;
        if (a.equalsIgnoreCase(d)) return;
        anotar(pagoId, GymPaymentAjuste.EDICION, campo, antes, despues, hechoPor);
    }

    private void anotar(UUID pagoId, String tipo, String campo, String antes, String despues, String hechoPor) {
        GymPaymentAjuste ajuste = new GymPaymentAjuste();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        ajuste.setTenant(tenant);
        ajuste.setPaymentId(pagoId);
        ajuste.setTipo(tipo);
        ajuste.setCampo(campo);
        ajuste.setAntes(recortar(antes));
        ajuste.setDespues(recortar(despues));
        ajuste.setHechoPorNombre(hechoPor);
        ajusteRepository.save(ajuste);
    }

    private static String resumirCobro(GymPayment p) {
        return String.format("%s %s el %s",
                texto(p.getAmount()),
                p.getPaymentMethod() != null ? p.getPaymentMethod() : "",
                p.getPaymentDate() != null ? p.getPaymentDate().toLocalDate() : "");
    }

    private static String texto(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String recortar(String s) {
        return recortar(s, 255);
    }

    private static String recortar(String s, int largo) {
        if (s == null) return null;
        return s.length() > largo ? s.substring(0, largo) : s;
    }
}
