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

    public List<AccessLog> getTodayAccesses() {
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();
        LocalDateTime endOfDay = LocalDate.now().atTime(LocalTime.MAX);
        return accessLogRepository.findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), startOfDay, endOfDay);
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
