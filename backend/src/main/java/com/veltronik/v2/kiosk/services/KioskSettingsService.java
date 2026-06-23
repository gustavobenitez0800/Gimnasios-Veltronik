package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskSettingsInputDTO;
import com.veltronik.v2.kiosk.entities.KioskSettings;
import com.veltronik.v2.kiosk.repositories.KioskSettingsRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

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

    // SIN @Transactional a propósito: el get-or-create lazy puede correr en paralelo (la pantalla
    // de Ajustes y el listener de facturación que corre en CADA venta lo invocan). Con una sola
    // transacción, el choque del unique tenant_id deja la tx envenenada y no se puede releer.
    // Cada operación de repo en su propia tx → el catch+reread funciona (idempotente, no 409).
    public KioskSettings getOrCreateForCurrentTenant() {
        UUID tenantId = TenantContextHolder.getTenantId();
        return settingsRepository.findByTenantId(tenantId).orElseGet(() -> createDefault(tenantId));
    }

    /** Crea la fila con defaults; si otra request la creó en la ventana del get-or-create, el unique
     *  de tenant_id la rechaza → devolvemos la existente en vez de propagar un 409. */
    private KioskSettings createDefault(UUID tenantId) {
        try {
            KioskSettings s = new KioskSettings(); // defaults en la entidad
            Tenant tenant = new Tenant();
            tenant.setId(tenantId);
            s.setTenant(tenant);
            return settingsRepository.saveAndFlush(s);
        } catch (DataIntegrityViolationException race) {
            return settingsRepository.findByTenantId(tenantId).orElseThrow(() -> race);
        }
    }

    /** Patch parcial: solo pisa lo que vino en el request. */
    public KioskSettings updateForCurrentTenant(KioskSettingsInputDTO in) {
        KioskSettings s = getOrCreateForCurrentTenant();
        if (in.getCardSurchargePct() != null) s.setCardSurchargePct(in.getCardSurchargePct());
        if (in.getAllowFiado() != null) s.setAllowFiado(in.getAllowFiado());
        if (in.getAutoInvoice() != null) s.setAutoInvoice(in.getAutoInvoice());
        if (in.getLowStockAlert() != null) s.setLowStockAlert(in.getLowStockAlert());
        return settingsRepository.save(s);
    }
}
