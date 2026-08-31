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
import java.util.Map;
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

    /**
     * Socios que entraron SOLOS por QR y necesitan que alguien les hable.
     *
     * <p>Es la otra punta del check-in: cuando un socio vencido escanea el cartel, el aviso
     * aparece en SU teléfono y ahí muere. Sin esto, la recepcionista se enteraría solo si
     * mirara la lista de accesos cruzando a mano el estado de cada uno — o sea, nunca.</p>
     *
     * <p>La consulta es liviana y la pantalla la repite cada pocos segundos, así que devuelve
     * lo mínimo: quién, qué le pasa y a qué hora entró.</p>
     */
    @GetMapping("/avisos")
    public ResponseEntity<List<AccessLogService.Aviso>> avisos() {
        return ResponseEntity.ok(accessService.avisosPendientes());
    }

    /** "Ya lo hablé con él": saca el aviso de la lista, en todas las terminales. */
    @PostMapping("/avisos/{id}/visto")
    public ResponseEntity<Void> marcarAvisoVisto(@PathVariable java.util.UUID id) {
        accessService.marcarAvisoVisto(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Marca el paso de un socio desde el mostrador.
     *
     * <p><b>Devuelve QUÉ se hizo, no solo el registro.</b> Este endpoint no siempre registra
     * una entrada: si el socio ya estaba adentro, graba la SALIDA — lo decide el servidor
     * mirando el estado, que es lo correcto. Pero el botón del mostrador decía siempre
     * "Registrar entrada" y el cartel de confirmación solo decía "Fulano registrado", así que
     * la recepcionista podía apretar "entrada", grabar una salida, y no enterarse nunca.</p>
     *
     * <p>Con la dirección en la respuesta, la pantalla puede decir la verdad de lo que pasó.</p>
     */
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> registerAccess(@RequestBody AccessRegisterInputDTO input) {
        AccessLogService.ScanResult r =
                accessService.registerScan(input.getMemberId(), input.getMethod(), null, null);

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("acceso", accessMapper.toDto(r.log()));
        body.put("direccion", r.direction().name());
        // true cuando el socio había dejado una visita abierta de otro día: el mostrador tiene
        // que poder explicarle por qué le figura una entrada nueva y no una salida.
        body.put("recuperado", r.recuperado());
        return ResponseEntity.ok(body);
    }

    @PutMapping("/{id}/checkout")
    public ResponseEntity<AccessLogDTO> checkOut(@PathVariable UUID id) {
        return ResponseEntity.ok(accessMapper.toDto(accessService.checkOut(id)));
    }
}
