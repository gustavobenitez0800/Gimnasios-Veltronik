package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.fiscal.FiscalEmissionRequest;
import com.veltronik.v2.fiscal.FiscalFacade;
import com.veltronik.v2.kiosk.events.KioskSaleCompletedEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Puente kiosk → fiscal: cuando una venta se confirma (y la transacción COMMITEA), si el negocio
 * activó la facturación automática, emite el comprobante a ARCA.
 *
 * <p><b>Por qué así (Codex §5.2):</b> los módulos no se llaman directo, se comunican por eventos.
 * Kiosk solo publica "vendí"; este puente vive en kiosk (que SÍ puede depender de la fachada
 * compartida {@code fiscal}; al revés está prohibido por ArchUnit).</p>
 *
 * <p><b>AFTER_COMMIT + @Async:</b> la venta primero se persiste y confirma; recién después, en otro
 * hilo, se factura. El POS nunca espera a ARCA, y un problema fiscal jamás voltea una venta.</p>
 */
@Component
@Slf4j
public class KioskInvoicingListener {

    private final KioskSettingsService settingsService;
    private final FiscalFacade fiscalFacade;

    public KioskInvoicingListener(KioskSettingsService settingsService, FiscalFacade fiscalFacade) {
        this.settingsService = settingsService;
        this.fiscalFacade = fiscalFacade;
    }

    @Async("fiscalEmissionExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSaleCompleted(KioskSaleCompletedEvent event) {
        try {
            // Hilo async: propagamos el tenant a mano (el ThreadLocal no viaja entre hilos).
            TenantContextHolder.setTenantId(event.tenantId());
            if (!settingsService.getOrCreateForCurrentTenant().isAutoInvoice()) {
                return; // el negocio no factura automáticamente
            }
            fiscalFacade.emitir(FiscalEmissionRequest.consumidorFinal(
                    "KIOSK_SALE", event.saleId(), event.total(), null));
            log.info("Venta {} enviada a facturación ARCA.", event.saleId());
        } catch (Exception e) {
            // Nunca propagamos: la venta ya está hecha. Si falla, queda registrado (y la
            // contingencia/retry del módulo fiscal se encarga de lo recuperable).
            log.error("No se pudo facturar la venta {} a ARCA: {}", event.saleId(), e.getMessage());
        } finally {
            TenantContextHolder.clear();
        }
    }
}
