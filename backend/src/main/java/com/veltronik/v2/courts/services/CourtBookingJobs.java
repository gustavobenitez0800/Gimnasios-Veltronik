package com.veltronik.v2.courts.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Jobs del módulo de canchas. Corren SIN contexto de tenant (el filtro de Hibernate no
 * está activo en threads de scheduler), así que barren todos los tenants: las queries de
 * los services usados acá ya scopean explícitamente.
 *
 * <p>Mismo patrón que {@code TenantSubscriptionJob}: cron con zona AR (la zona de la JVM
 * ya está fijada a AR, pero se explicita igual — Cero Margen de Error).</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CourtBookingJobs {

    private final CourtBookingService bookingService;
    private final CourtRecurringBookingService recurringService;

    /**
     * Motor de urgencia: cada 60s libera las señas vencidas (PENDING_DEPOSIT cuyo
     * expires_at pasó → EXPIRED, el slot vuelve a verde). En Fase 3 el bot agrega
     * el mensaje de WhatsApp; el motor ya queda vivo desde la Fase 1.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void expireOverdueDeposits() {
        try {
            int expired = bookingService.expireOverdueDeposits();
            if (expired > 0) {
                log.info("Señas vencidas: {} turnos liberados.", expired);
            }
        } catch (Exception e) {
            log.error("Error liberando señas vencidas", e);
        }
    }

    /** Mantiene materializado el horizonte de turnos fijos de todos los tenants. */
    @Scheduled(cron = "0 15 3 * * ?", zone = "America/Argentina/Buenos_Aires")
    public void materializeRecurringBookings() {
        try {
            int created = recurringService.materializeAllActive();
            if (created > 0) {
                log.info("Turnos fijos: {} instancias nuevas materializadas.", created);
            }
        } catch (Exception e) {
            log.error("Error materializando turnos fijos", e);
        }
    }
}
