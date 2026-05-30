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

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalMembers", totalMembers);
        stats.put("activeMembers", activeMembers);
        stats.put("inactiveMembers", totalMembers - activeMembers);
        stats.put("monthlyRevenue", monthlyRevenue);

        return stats;
    }
}
