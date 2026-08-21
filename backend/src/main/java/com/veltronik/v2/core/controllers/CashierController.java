package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.services.CashierService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Las personas del mostrador y el cambio de turno.
 *
 * <p>Dos públicos distintos en el mismo recurso, y por eso los permisos van por método:</p>
 * <ul>
 *   <li><b>Gestionar</b> (alta, baja, cambiar PIN) es del dueño o el admin.</li>
 *   <li><b>Marcar turno</b> lo hace quien esté en el mostrador — incluida la recepcionista,
 *       que justamente es la que lo va a usar dos veces por día. Si esto exigiera rol de
 *       admin, el cambio de turno sería imposible y la función no serviría para nada.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/core/cashiers")
@RequiredArgsConstructor
public class CashierController {

    private final CashierService cashierService;

    // ── El turno: lo usa cualquiera del mostrador ──────────────────────────────

    /**
     * A quién se le puede marcar turno. Devuelve solo id y nombre: la lista se muestra en
     * una pantalla abierta, no tiene por qué decir nada más.
     */
    @GetMapping("/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> listActive() {
        return ResponseEntity.ok(cashierService.listActive().stream()
                .map(c -> Map.<String, Object>of("id", c.getId(), "name", c.getName()))
                .toList());
    }

    /** Abre el turno si el PIN es correcto. */
    @PostMapping("/{cashierId}/shift")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> startShift(@PathVariable UUID cashierId,
                                                         @RequestBody PinRequest request) {
        Cashier cashier = cashierService.verifyPin(cashierId, request.getPin());
        return ResponseEntity.ok(Map.of("id", cashier.getId(), "name", cashier.getName()));
    }

    // ── Gestión: dueño y admin ─────────────────────────────────────────────────

    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> listAll() {
        return ResponseEntity.ok(cashierService.listAll().stream()
                .map(c -> Map.<String, Object>of("id", c.getId(), "name", c.getName(), "active", c.isActive()))
                .toList());
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Map<String, Object>> create(@RequestBody CashierRequest request) {
        Cashier creado = cashierService.create(request.getName(), request.getPin());
        return ResponseEntity.ok(Map.of("id", creado.getId(), "name", creado.getName(), "active", creado.isActive()));
    }

    @PutMapping("/{cashierId}/pin")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Map<String, Object>> changePin(@PathVariable UUID cashierId,
                                                        @RequestBody PinRequest request) {
        cashierService.changePin(cashierId, request.getPin());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PutMapping("/{cashierId}/name")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Map<String, Object>> rename(@PathVariable UUID cashierId,
                                                     @RequestBody CashierRequest request) {
        cashierService.rename(cashierId, request.getName());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** Baja lógica. Nunca borra: los movimientos históricos siguen diciendo quién fue. */
    @PutMapping("/{cashierId}/active")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Map<String, Object>> setActive(@PathVariable UUID cashierId,
                                                        @RequestBody ActiveRequest request) {
        cashierService.setActive(cashierId, Boolean.TRUE.equals(request.getActive()));
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @Data
    public static class CashierRequest {
        private String name;
        private String pin;
    }

    @Data
    public static class PinRequest {
        private String pin;
    }

    @Data
    public static class ActiveRequest {
        private Boolean active;
    }
}
