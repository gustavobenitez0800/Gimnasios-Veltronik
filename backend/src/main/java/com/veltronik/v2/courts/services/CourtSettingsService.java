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
        if (in.getPaymentAlias() != null) s.setPaymentAlias(in.getPaymentAlias().isBlank() ? null : in.getPaymentAlias().trim());
        // Bot de WhatsApp
        if (in.getBotEnabled() != null) s.setBotEnabled(in.getBotEnabled());
        if (in.getWaPhoneNumberId() != null) s.setWaPhoneNumberId(in.getWaPhoneNumberId().isBlank() ? null : in.getWaPhoneNumberId().trim());
        if (in.getBotInstructions() != null) s.setBotInstructions(in.getBotInstructions().isBlank() ? null : in.getBotInstructions().trim());
        // Token: solo se actualiza si viene un valor; en blanco NO borra (no exponerlo implica no reescribirlo sin querer).
        if (in.getWaAccessToken() != null && !in.getWaAccessToken().isBlank()) s.setWaAccessToken(in.getWaAccessToken().trim());
        return settingsRepository.save(s);
    }
}
