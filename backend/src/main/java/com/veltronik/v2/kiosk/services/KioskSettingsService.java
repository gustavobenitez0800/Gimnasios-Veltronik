package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskSettingsInputDTO;
import com.veltronik.v2.kiosk.entities.KioskSettings;
import com.veltronik.v2.kiosk.repositories.KioskSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Configuración del vertical Kiosco (una fila por tenant, creada lazy con defaults).
 * Mismo patrón que {@code CourtSettingsService}.
 */
@Service
public class KioskSettingsService {

    private final KioskSettingsRepository settingsRepository;

    public KioskSettingsService(KioskSettingsRepository settingsRepository) {
        this.settingsRepository = settingsRepository;
    }

    @Transactional
    public KioskSettings getOrCreateForCurrentTenant() {
        UUID tenantId = TenantContextHolder.getTenantId();
        return settingsRepository.findByTenantId(tenantId)
                .orElseGet(() -> {
                    KioskSettings s = new KioskSettings(); // defaults en la entidad
                    Tenant tenant = new Tenant();
                    tenant.setId(tenantId);
                    s.setTenant(tenant);
                    return settingsRepository.save(s);
                });
    }

    /** Patch parcial: solo pisa lo que vino en el request. */
    @Transactional
    public KioskSettings updateForCurrentTenant(KioskSettingsInputDTO in) {
        KioskSettings s = getOrCreateForCurrentTenant();
        if (in.getCardSurchargePct() != null) s.setCardSurchargePct(in.getCardSurchargePct());
        if (in.getAllowFiado() != null) s.setAllowFiado(in.getAllowFiado());
        if (in.getAutoInvoice() != null) s.setAutoInvoice(in.getAutoInvoice());
        if (in.getLowStockAlert() != null) s.setLowStockAlert(in.getLowStockAlert());
        return settingsRepository.save(s);
    }
}
