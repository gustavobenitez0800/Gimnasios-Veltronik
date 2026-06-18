package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskDashboardDTO;
import com.veltronik.v2.kiosk.dto.KioskReportDTO;
import com.veltronik.v2.kiosk.services.KioskAnalyticsService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * Analítica del kiosco: dashboard (rentabilidad, producto estrella, hora pico, fiado) y reportes
 * exportables por rango de fechas. Datos financieros → solo dueño/admin (mismo criterio que el
 * resto de las operaciones de plata del módulo y que la analítica de canchas).
 */
@RestController
@RequestMapping("/api/kiosk/analytics")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class KioskAnalyticsController {

    private final KioskAnalyticsService analyticsService;

    public KioskAnalyticsController(KioskAnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<KioskDashboardDTO> dashboard() {
        return ResponseEntity.ok(analyticsService.dashboard());
    }

    @GetMapping("/report")
    public ResponseEntity<KioskReportDTO> report(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(analyticsService.report(from, to));
    }
}
