package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.dto.CourtSettingsInputDTO;
import com.veltronik.v2.courts.entities.CourtSettings;
import com.veltronik.v2.courts.repositories.CourtSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configuración del vertical (una fila por tenant, creada lazy con defaults de F5).
 * Acá vive la diferencia entre deportes: slot de 60' (F5) vs 90' (Pádel futuro).
 */
@Service
public class CourtSettingsService {

    private final CourtSettingsRepository settingsRepository;

    public CourtSettingsService(CourtSettingsRepository settingsRepository) {
        this.settingsRepository = settingsRepository;
    }

    @Transactional
    public CourtSettings getOrCreateForCurrentTenant() {
        return getOrCreateForTenant(TenantContextHolder.getTenantId());
    }

    @Transactional
    public CourtSettings getOrCreateForTenant(java.util.UUID tenantId) {
        return settingsRepository.findByTenantId(tenantId)
                .orElseGet(() -> {
                    CourtSettings s = new CourtSettings(); // defaults F5 en la entidad
                    Tenant tenant = new Tenant();
                    tenant.setId(tenantId);
                    s.setTenant(tenant);
                    return settingsRepository.save(s);
                });
    }

    /** Patch parcial: solo pisa lo que vino en el request. */
    @Transactional
    public CourtSettings updateForCurrentTenant(CourtSettingsInputDTO in) {
        CourtSettings s = getOrCreateForCurrentTenant();
        if (in.getSlotDurationMinutes() != null) s.setSlotDurationMinutes(in.getSlotDurationMinutes());
        if (in.getOpeningTime() != null) s.setOpeningTime(in.getOpeningTime());
        if (in.getClosingTime() != null) s.setClosingTime(in.getClosingTime());
        if (in.getDefaultPrice() != null) s.setDefaultPrice(in.getDefaultPrice());
        if (in.getDepositAmount() != null) s.setDepositAmount(in.getDepositAmount());
        if (in.getDepositTimeoutMinutes() != null) s.setDepositTimeoutMinutes(in.getDepositTimeoutMinutes());
        return settingsRepository.save(s);
    }
}
