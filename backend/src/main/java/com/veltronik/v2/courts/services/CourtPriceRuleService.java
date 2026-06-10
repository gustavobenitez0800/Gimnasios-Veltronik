package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.entities.CourtPriceRule;
import com.veltronik.v2.courts.repositories.CourtPriceRuleRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Reglas de precio por franja. La resolución elige la regla MÁS específica que matchee:
 * cancha+día (3) &gt; cancha (2) &gt; día (1) &gt; general (0). Sin match → defaultPrice
 * de la configuración (puede ser null: el dueño carga el precio a mano en el turno).
 */
@Service
public class CourtPriceRuleService {

    private final CourtPriceRuleRepository ruleRepository;

    public CourtPriceRuleService(CourtPriceRuleRepository ruleRepository) {
        this.ruleRepository = ruleRepository;
    }

    public List<CourtPriceRule> findAllForCurrentTenant() {
        return ruleRepository.findByTenantId(TenantContextHolder.getTenantId());
    }

    public CourtPriceRule findByIdAndVerifyOwnership(UUID id) {
        CourtPriceRule rule = ruleRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Regla de precio no encontrada"));
        if (!rule.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a esta regla");
        }
        return rule;
    }

    @Transactional
    public CourtPriceRule saveForCurrentTenant(CourtPriceRule rule) {
        if (rule.getTenant() == null) {
            Tenant tenant = new Tenant();
            tenant.setId(TenantContextHolder.getTenantId());
            rule.setTenant(tenant);
        } else if (!rule.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
        if (!rule.getTimeTo().isAfter(rule.getTimeFrom())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El fin de la franja debe ser posterior al inicio");
        }
        return ruleRepository.save(rule);
    }

    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        ruleRepository.delete(findByIdAndVerifyOwnership(id));
    }

    /**
     * Precio del turno que arranca en {@code startAt} en la cancha dada.
     * Recibe el tenantId explícito para servir también a los jobs (que corren sin
     * contexto de request). {@code fallback} = defaultPrice de la configuración.
     */
    public BigDecimal resolvePrice(UUID tenantId, UUID courtId, LocalDateTime startAt, BigDecimal fallback) {
        int isoDay = startAt.getDayOfWeek().getValue(); // 1 = lunes ... 7 = domingo
        LocalTime time = startAt.toLocalTime();

        return ruleRepository.findByTenantId(tenantId).stream()
                .filter(r -> r.getCourt() == null || r.getCourt().getId().equals(courtId))
                .filter(r -> r.getDayOfWeek() == null || r.getDayOfWeek() == isoDay)
                .filter(r -> !time.isBefore(r.getTimeFrom()) && time.isBefore(r.getTimeTo()))
                .max(Comparator.comparingInt(r ->
                        (r.getCourt() != null ? 2 : 0) + (r.getDayOfWeek() != null ? 1 : 0)))
                .map(CourtPriceRule::getPrice)
                .orElse(fallback);
    }
}
