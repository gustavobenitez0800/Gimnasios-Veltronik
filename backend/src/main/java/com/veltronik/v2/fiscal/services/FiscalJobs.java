package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.fiscal.entities.FiscalVoucher;
import com.veltronik.v2.fiscal.entities.FiscalVoucherStatus;
import com.veltronik.v2.fiscal.repositories.FiscalVoucherRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Motor de contingencia fiscal: reintenta los comprobantes que quedaron en CONTINGENCY porque
 * ARCA no respondió cuando se emitió la venta. Corre SIN contexto de tenant (barre todos); cada
 * reintento resuelve la config del tenant del comprobante. Mismo patrón que {@code CourtBookingJobs}.
 */
@Component
@Slf4j
public class FiscalJobs {

    private final FiscalVoucherRepository voucherRepository;
    private final FiscalService fiscalService;

    public FiscalJobs(FiscalVoucherRepository voucherRepository, FiscalService fiscalService) {
        this.voucherRepository = voucherRepository;
        this.fiscalService = fiscalService;
    }

    /** Cada 2 minutos reintenta los comprobantes en contingencia hasta obtener su CAE. */
    @Scheduled(fixedDelay = 120_000, initialDelay = 60_000)
    public void retryContingency() {
        try {
            List<FiscalVoucher> pending = voucherRepository
                    .findTop200ByStatusOrderByCreatedAtAsc(FiscalVoucherStatus.CONTINGENCY);
            if (pending.isEmpty()) return;
            for (FiscalVoucher voucher : pending) {
                try {
                    fiscalService.retry(voucher);
                } catch (Exception e) {
                    log.error("Error reintentando comprobante {}: {}", voucher.getId(), e.getMessage());
                }
            }
            log.info("Contingencia fiscal: {} comprobantes reintentados.", pending.size());
        } catch (Exception e) {
            log.error("Error en el cron de contingencia fiscal", e);
        }
    }
}
