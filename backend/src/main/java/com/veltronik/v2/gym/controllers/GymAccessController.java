package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.AccessLogDTO;
import com.veltronik.v2.gym.dto.AccessRegisterInputDTO;
import com.veltronik.v2.gym.mappers.AccessLogMapper;
import com.veltronik.v2.gym.services.AccessLogService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * API REST de control de acceso del gimnasio.
 *
 * Devuelve SIEMPRE {@link AccessLogDTO} (nunca la entidad {@code AccessLog} cruda) y
 * recibe {@link AccessRegisterInputDTO} (no un Map sin tipar). El frontend solo dibuja
 * el contrato del DTO.
 */
@RestController
@RequestMapping("/api/gym/access")
public class GymAccessController {

    private final AccessLogService accessService;
    private final AccessLogMapper accessMapper;

    public GymAccessController(AccessLogService accessService, AccessLogMapper accessMapper) {
        this.accessService = accessService;
        this.accessMapper = accessMapper;
    }

    @GetMapping("/today")
    public ResponseEntity<List<AccessLogDTO>> getTodayAccesses() {
        return ResponseEntity.ok(accessMapper.toDtoList(accessService.getTodayAccesses()));
    }

    /**
     * Accesos en un rango de fechas (usado por Reportes: asistencia y resumen).
     * {@code GET /api/gym/access?start=YYYY-MM-DD&end=YYYY-MM-DD}.
     */
    @GetMapping
    public ResponseEntity<List<AccessLogDTO>> getAccessesByRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(accessMapper.toDtoList(accessService.getAccessesByDateRange(start, end)));
    }

    @GetMapping("/active")
    public ResponseEntity<List<AccessLogDTO>> getActiveAccesses() {
        return ResponseEntity.ok(accessMapper.toDtoList(accessService.getActiveAccesses()));
    }

    @PostMapping("/register")
    public ResponseEntity<AccessLogDTO> registerAccess(@RequestBody AccessRegisterInputDTO input) {
        return ResponseEntity.ok(accessMapper.toDto(
                accessService.registerAccess(input.getMemberId(), input.getMethod())));
    }

    @PutMapping("/{id}/checkout")
    public ResponseEntity<AccessLogDTO> checkOut(@PathVariable UUID id) {
        return ResponseEntity.ok(accessMapper.toDto(accessService.checkOut(id)));
    }
}
