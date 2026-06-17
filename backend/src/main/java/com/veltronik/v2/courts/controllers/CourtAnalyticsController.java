package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtDashboardDTO;
import com.veltronik.v2.courts.dto.CourtReportDTO;
import com.veltronik.v2.courts.services.CourtAnalyticsService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * Analítica del complejo: dashboard (ganancias, ocupación, predicción IA) y reportes
 * exportables. Datos financieros → solo dueño/admin (mismo criterio que el gym).
 */
@RestController
@RequestMapping("/api/courts/analytics")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class CourtAnalyticsController {

    private final CourtAnalyticsService analyticsService;

    public CourtAnalyticsController(CourtAnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<CourtDashboardDTO> dashboard() {
        return ResponseEntity.ok(analyticsService.dashboard());
    }

    @GetMapping("/report")
    public ResponseEntity<CourtReportDTO> report(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(analyticsService.report(from, to));
    }
}
