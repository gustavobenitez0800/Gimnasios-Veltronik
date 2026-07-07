package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.mappers.GymMemberMapper;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GymDashboardService {

    /**
     * Zona horaria del negocio (Argentina). Los timestamps se guardan SIN zona
     * ({@code timestamp without time zone}), representando la hora de pared de Argentina
     * (los pagos quedan a las 00:00 del día calendario AR).
     *
     * <p>Calcular el "mes actual" o el "ahora" con la zona del servidor (Railway corre
     * en UTC) corría el límite hasta 3 horas: en la franja 21:00–23:59 AR del último día
     * del mes, UTC ya marcaba el mes siguiente y "Ingresos del Mes" daba $0. Anclando los
     * cálculos a esta zona, la comparación es naive-AR vs naive-AR: exacta. Se usa el id
     * IANA (no un offset fijo {@code -03:00}) para ser robusto ante cualquier regla de DST.</p>
     */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    private final GymMemberRepository memberRepository;
    private final GymPaymentRepository paymentRepository;
    private final GymMemberMapper memberMapper;

    public Map<String, Object> getDashboardStats() {
        UUID tenantId = TenantContextHolder.getTenantId();
        
        long totalMembers = memberRepository.countByTenantId(tenantId);
        long activeMembers = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);

        // "Mes actual" y "ahora" en hora de Argentina (no la del servidor UTC).
        LocalDateTime startOfMonth = YearMonth.now(BUSINESS_ZONE).atDay(1).atStartOfDay();
        BigDecimal monthlyRevenue = paymentRepository.sumAmountByTenantIdAndDateAfter(tenantId, startOfMonth);

        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime in7Days = now.plusDays(7);
        // COUNT en BD: el dashboard solo necesita el número, no las entidades.
        long expiringMembers = memberRepository.countByTenantIdAndMembershipEndBetween(tenantId, now, in7Days);
        long expiredMembers = memberRepository.countByTenantIdAndIsActiveTrueAndMembershipEndBefore(tenantId, now);

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalMembers", totalMembers);
        stats.put("activeMembers", activeMembers);
        stats.put("inactiveMembers", totalMembers - activeMembers);
        stats.put("monthlyRevenue", monthlyRevenue != null ? monthlyRevenue : BigDecimal.ZERO);
        stats.put("expiringMembers", expiringMembers);
        stats.put("expiredMembers", expiredMembers);

        return stats;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getRetentionAnalytics() {
        UUID tenantId = TenantContextHolder.getTenantId();
        
        long totalMembers = memberRepository.countByTenantId(tenantId);
        long activeMembers = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);
        long inactiveMembers = totalMembers - activeMembers;
        
        double retentionRate = totalMembers > 0 ? ((double) activeMembers / totalMembers) * 100.0 : 0.0;

        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime in7Days = now.plusDays(7);
        
        // Expiring soon: Memberships ending between now and next 7 days
        var expiringSoon = memberRepository.findByTenantIdAndMembershipEndBetween(tenantId, now, in7Days);
        
        // At risk: Members who are marked active but their membership has already expired
        var atRisk = memberRepository.findByTenantIdAndIsActiveTrueAndMembershipEndBefore(tenantId, now);
        
        Map<String, Object> analytics = new HashMap<>();
        analytics.put("total_members", totalMembers);
        analytics.put("active_members", activeMembers);
        analytics.put("inactive_members", inactiveMembers);
        analytics.put("retention_rate", Math.round(retentionRate));
        // DTO (no la entidad cruda): el front lee fullName/membershipEnd/phone. Con la entidad
        // cruda llegaban firstName/lastName (NO fullName) → los socios salían sin nombre, y se
        // exponia la entidad JPA (con su tenant lazy → riesgo de 500). Mandamiento #5.
        analytics.put("expiring_soon", memberMapper.toDtoList(expiringSoon));
        analytics.put("at_risk", memberMapper.toDtoList(atRisk));

        return analytics;
    }
}
