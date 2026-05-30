package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class TenantSubscriptionJob {

    private final TenantRepository tenantRepository;

    /**
     * Kill Switch (Nivel 1): Job Diario.
     * Se ejecuta todos los días a las 00:05 AM.
     *
     * Busca tenants cuya suscripción expiró directamente en la BD (no carga todos a memoria)
     * y los desactiva automáticamente. Esto garantiza que el sistema siga cobrando
     * mientras el dueño duerme.
     *
     * IMPORTANTE: Si se escala horizontalmente (múltiples instancias en Railway),
     * agregar ShedLock para evitar ejecuciones paralelas duplicadas.
     */
    @Scheduled(cron = "0 5 0 * * ?")
    @Transactional
    public void executeKillSwitch() {
        log.info("=== KILL SWITCH CRONJOB INICIADO ===");

        LocalDateTime now = LocalDateTime.now();

        // Query optimizada: filtra en BD, no en memoria
        List<Tenant> expiredTenants = tenantRepository.findExpiredActiveTenants(now);

        if (expiredTenants.isEmpty()) {
            log.info("Kill Switch: Sin sucursales morosas detectadas. Todo el sistema al día.");
            return;
        }

        expiredTenants.forEach(tenant -> {
            tenant.setActive(false);
            log.warn("KILL SWITCH ACTIVADO — Sucursal '{}' (ID: {}) bloqueada. Trial/suscripción venció el: {}",
                    tenant.getName(), tenant.getId(), tenant.getTrialEndsAt());
        });

        tenantRepository.saveAll(expiredTenants);
        log.info("=== KILL SWITCH FINALIZADO: {} sucursal(es) bloqueada(s) ===", expiredTenants.size());
    }
}
