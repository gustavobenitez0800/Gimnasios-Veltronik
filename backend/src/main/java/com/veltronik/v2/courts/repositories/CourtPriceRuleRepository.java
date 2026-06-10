package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtPriceRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CourtPriceRuleRepository extends JpaRepository<CourtPriceRule, UUID> {
    List<CourtPriceRule> findByTenantId(UUID tenantId);
}
