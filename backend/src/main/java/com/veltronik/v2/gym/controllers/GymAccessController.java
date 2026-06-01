package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.services.AccessLogService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/access")
public class GymAccessController {

    private final AccessLogService accessService;

    public GymAccessController(AccessLogService accessService) {
        this.accessService = accessService;
    }

    @GetMapping("/today")
    public ResponseEntity<List<AccessLog>> getTodayAccesses() {
        return ResponseEntity.ok(accessService.getTodayAccesses());
    }

    /**
     * Accesos en un rango de fechas (usado por Reportes: asistencia y resumen).
     * {@code GET /api/gym/access?start=YYYY-MM-DD&end=YYYY-MM-DD}. Antes el frontend
     * llamaba este endpoint pero no existía → el reporte de asistencia por rango fallaba.
     */
    @GetMapping
    public ResponseEntity<List<AccessLog>> getAccessesByRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(accessService.getAccessesByDateRange(start, end));
    }

    @GetMapping("/active")
    public ResponseEntity<List<AccessLog>> getActiveAccesses() {
        return ResponseEntity.ok(accessService.getActiveAccesses());
    }

    @PostMapping("/register")
    public ResponseEntity<AccessLog> registerAccess(@RequestBody Map<String, Object> payload) {
        UUID memberId = UUID.fromString((String) payload.get("memberId"));
        String method = (String) payload.get("method");
        return ResponseEntity.ok(accessService.registerAccess(memberId, method));
    }

    @PutMapping("/{id}/checkout")
    public ResponseEntity<AccessLog> checkOut(@PathVariable UUID id) {
        return ResponseEntity.ok(accessService.checkOut(id));
    }
}
