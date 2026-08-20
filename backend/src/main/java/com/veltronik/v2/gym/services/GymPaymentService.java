package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class GymPaymentService {

    private final GymPaymentRepository repository;
    private final GymMemberService memberService;

    public GymPaymentService(GymPaymentRepository repository, GymMemberService memberService) {
        this.repository = repository;
        this.memberService = memberService;
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

        GymPayment saved = repository.save(payment);
        extenderCobertura(saved, member);
        return saved;
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
        LocalDateTime hasta = payment.getPeriodEnd();
        if (hasta == null) return;                        // sin período: no dice hasta cuándo cubre

        LocalDateTime vigente = member.getMembershipEnd();
        if (vigente != null && !hasta.isAfter(vigente)) return; // nunca hacia atrás

        member.setMembershipEnd(hasta);
        // Reactivar va ATADO a la extensión, no al pago: si el pago no corrió la fecha
        // (era viejo), tampoco tiene por qué revivir a alguien que el dueño dio de baja.
        member.setActive(true);
        memberService.saveForCurrentTenant(member);
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
    
    public void deleteAndVerifyOwnership(UUID id) {
        GymPayment payment = findByIdAndVerifyOwnership(id);
        repository.delete(payment);
    }
}
