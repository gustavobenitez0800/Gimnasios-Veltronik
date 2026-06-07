package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.BaseServiceImpl;
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
        
        // Ensure the member belongs to the tenant
        if (payment.getMember() != null && payment.getMember().getId() != null) {
            GymMember member = memberService.findByIdAndVerifyOwnership(payment.getMember().getId());
            payment.setMember(member);
        }
        
        return repository.save(payment);
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
