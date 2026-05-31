package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GymDashboardService {

    private final GymMemberRepository memberRepository;
    private final GymPaymentRepository paymentRepository;

    public Map<String, Object> getDashboardStats() {
        UUID tenantId = TenantContextHolder.getTenantId();
        
        long totalMembers = memberRepository.countByTenantId(tenantId);
        long activeMembers = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);
        
        LocalDateTime startOfMonth = YearMonth.now().atDay(1).atStartOfDay();
        BigDecimal monthlyRevenue = paymentRepository.sumAmountByTenantIdAndDateAfter(tenantId, startOfMonth);

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime in7Days = now.plusDays(7);
        long expiringMembers = memberRepository.findByTenantIdAndMembershipEndBetween(tenantId, now, in7Days).size();
        long expiredMembers = memberRepository.findByTenantIdAndIsActiveTrueAndMembershipEndBefore(tenantId, now).size();

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalMembers", totalMembers);
        stats.put("activeMembers", activeMembers);
        stats.put("inactiveMembers", totalMembers - activeMembers);
        stats.put("monthlyRevenue", monthlyRevenue != null ? monthlyRevenue : BigDecimal.ZERO);
        stats.put("expiringMembers", expiringMembers);
        stats.put("expiredMembers", expiredMembers);

        return stats;
    }

    public Map<String, Object> getRetentionAnalytics() {
        UUID tenantId = TenantContextHolder.getTenantId();
        
        long totalMembers = memberRepository.countByTenantId(tenantId);
        long activeMembers = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);
        long inactiveMembers = totalMembers - activeMembers;
        
        double retentionRate = totalMembers > 0 ? ((double) activeMembers / totalMembers) * 100.0 : 0.0;
        
        LocalDateTime now = LocalDateTime.now();
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
        analytics.put("expiring_soon", expiringSoon);
        analytics.put("at_risk", atRisk);
        
        return analytics;
    }
}
