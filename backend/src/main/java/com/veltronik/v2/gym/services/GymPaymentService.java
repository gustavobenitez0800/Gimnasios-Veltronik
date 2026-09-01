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
        LocalDateTime toDt = (to != null) ? to.atTime(LocalTime.MAX) : LocalDateTime.of(2999, 12, 31, 23, 59, 59);
        return repository.findByTenantIdAndDateRange(TenantContextHolder.getTenantId(), fromDt, toDt);
    }

    /** Historial de pagos de un socio, acotado al tenant actual (aislamiento garantizado). */
    public List<GymPayment> findByMemberIdForCurrentTenant(UUID memberId) {
        return repository.findByTenantIdAndMemberId(TenantContextHolder.getTenantId(), memberId);
    }
    
    public GymPayment saveForCurrentTenant(GymPayment payment) {
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());
        payment.setTenant(tenant);

        // Una sola caja para el estado, decidida acá y no por quien mande la request.
        // Convivían "PAID" (default de la entidad) y "paid" (lo que manda el frontend) en
        // la misma columna, y la suma de ingresos del Dashboard comparaba exacto contra
        // 'PAID' → no contaba nada de lo cargado desde la app.
        normalizarEstado(payment);

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
        if (payment.getPlan() != null && payment.getPlan().getId() != null) {
            GymPlan plan = planService.findByIdAndVerifyOwnership(payment.getPlan().getId());
            payment.setPlan(plan);
            aplicarPeriodoDelPlan(payment, plan, member);
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
        if (plan.getDurationDays() <= 0) return;

        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime vigente = (member != null) ? member.getMembershipEnd() : null;
        LocalDateTime desde = (vigente != null && vigente.isAfter(ahora)) ? vigente : ahora;

        payment.setPeriodStart(desde);
        payment.setPeriodEnd(desde.plusDays(plan.getDurationDays()));
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
        sumarClasesDelPlan(payment, member);
    }

    /**
     * Le suma al socio las visitas que otorga el arancel cobrado.
     *
     * <p><b>Suma, no reemplaza.</b> Si le quedaban 5 clases y compra un abono de 30, queda con
     * 35: esas 5 las pagó. Es la misma lógica que la fecha, que se extiende desde el
     * vencimiento vigente en vez de arrancar de hoy — quien renueva antes de que se le acabe
     * no pierde lo que le sobraba.</p>
     *
     * <p><b>Un arancel sin clases (NULL) no toca el contador.</b> No lo pone en cero ni lo
     * borra: si un gimnasio vende una mensualidad libre a alguien que tenía cupo, sacarle el
     * cupo en silencio sería decidir por él. Eso se cambia a mano desde la ficha del socio,
     * que es donde se ve lo que está pasando.</p>
     */
    private void sumarClasesDelPlan(GymPayment payment, GymMember member) {
        GymPlan plan = payment.getPlan();
        if (plan == null || plan.getClasses() == null || plan.getClasses() <= 0) return;

        int actuales = member.getClassesRemaining() != null ? member.getClassesRemaining() : 0;
        member.setClassesRemaining(actuales + plan.getClasses());
        memberService.saveForCurrentTenant(member);
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
    
    public GymPayment findByIdAndVerifyOwnership(UUID id) {
        GymPayment payment = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pago de gym no encontrado"));
                
        if (!payment.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este pago");
        }
        return payment;
    }
    
    /**
     * Borra un cobro, DEJANDO RASTRO.
     *
     * <p>El rastro se guarda ANTES de borrar y no tiene FK al cobro: si la tuviera, el
     * borrado en cascada se llevaría puesta justamente la prueba de que se borró.</p>
     *
     * <p>⚠️ Borrar un cobro NO recalcula la cobertura del socio. Eso es a propósito —el
     * backend nunca acorta una membresía hacia atrás— pero significa que un cobro borrado
     * deja al socio figurando al día. Sin este rastro, esa plata desaparecía sin que nadie
     * pudiera notarlo nunca.</p>
     */
    @Transactional
    public void deleteAndVerifyOwnership(UUID id, String hechoPor) {
        GymPayment payment = findByIdAndVerifyOwnership(id);
        anotar(payment.getId(), GymPaymentAjuste.BORRADO, null, resumirCobro(payment), null, hechoPor);
        repository.delete(payment);
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
        if (s == null) return null;
        return s.length() > 255 ? s.substring(0, 255) : s;
    }
}
