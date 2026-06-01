package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.AccessLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class AccessLogService {

    private final AccessLogRepository accessLogRepository;
    private final GymMemberService memberService;

    public AccessLogService(AccessLogRepository accessLogRepository, GymMemberService memberService) {
        this.accessLogRepository = accessLogRepository;
        this.memberService = memberService;
    }

    /** Zona del negocio (Argentina): "hoy" y los rangos se calculan en hora AR, no UTC. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    public List<AccessLog> getTodayAccesses() {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        LocalDateTime startOfDay = today.atStartOfDay();
        LocalDateTime endOfDay = today.atTime(LocalTime.MAX);
        return accessLogRepository.findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), startOfDay, endOfDay);
    }

    /**
     * Accesos del tenant en un rango de fechas [start, end] (día calendario AR).
     * start → 00:00:00, end → 23:59:59 (fin de día inclusivo). Usado por Reportes.
     */
    public List<AccessLog> getAccessesByDateRange(LocalDate start, LocalDate end) {
        LocalDateTime from = start.atStartOfDay();
        LocalDateTime to = end.atTime(LocalTime.MAX);
        return accessLogRepository.findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), from, to);
    }

    public List<AccessLog> getActiveAccesses() {
        return accessLogRepository.findByTenantIdAndCheckOutAtIsNullOrderByCheckInAtDesc(TenantContextHolder.getTenantId());
    }

    @Transactional
    public AccessLog registerAccess(UUID memberId, String method) {
        // Verifica que el socio exista y pertenezca al Tenant actual
        GymMember member = memberService.findByIdAndVerifyOwnership(memberId);
        
        // Revisar si ya tiene un acceso abierto (sin check-out)
        Optional<AccessLog> activeAccess = accessLogRepository.findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), memberId);
                
        if (activeAccess.isPresent()) {
            // Si tiene acceso abierto, hacemos check-out
            AccessLog log = activeAccess.get();
            log.setCheckOutAt(LocalDateTime.now());
            return accessLogRepository.save(log);
        } else {
            // Si no, registramos entrada
            AccessLog log = new AccessLog();
            Tenant tenant = new Tenant();
            tenant.setId(TenantContextHolder.getTenantId());
            
            log.setTenant(tenant);
            log.setMember(member);
            log.setCheckInAt(LocalDateTime.now());
            log.setAccessMethod(method != null ? method : "MANUAL");
            return accessLogRepository.save(log);
        }
    }

    @Transactional
    public AccessLog checkOut(UUID accessLogId) {
        AccessLog log = accessLogRepository.findById(accessLogId)
                .orElseThrow(() -> new RuntimeException("Registro de acceso no encontrado"));
                
        if (!log.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new RuntimeException("Acceso denegado");
        }
        
        if (log.getCheckOutAt() == null) {
            log.setCheckOutAt(LocalDateTime.now());
        }
        
        return accessLogRepository.save(log);
    }
}
