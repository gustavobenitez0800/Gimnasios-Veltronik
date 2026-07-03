package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.CashierService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Gestión de cajeros con PIN (Fase 1, ladrillo 5). El PIN JAMÁS se devuelve: entra en
 * el alta/reset, se hashea, y no vuelve a salir. Baja al local vía sync (CONFIG ↓).
 */
@RestController
@RequestMapping("/api/core/cashiers")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class CashierController {

    private final CashierService cashierService;

    @Data
    public static class CreateRequest {
        @NotBlank(message = "Poné el nombre del cajero")
        @Size(max = 120)
        private String name;
        @NotBlank(message = "Poné un PIN de 4 a 6 dígitos")
        @Pattern(regexp = "\\d{4,6}", message = "El PIN debe tener entre 4 y 6 dígitos")
        private String pin;
        private Cashier.Role role = Cashier.Role.CAJERO;
    }

    @Data
    public static class PinRequest {
        @NotBlank(message = "Poné un PIN de 4 a 6 dígitos")
        @Pattern(regexp = "\\d{4,6}", message = "El PIN debe tener entre 4 y 6 dígitos")
        private String pin;
    }

    @GetMapping
    public ResponseEntity<?> list() {
        UUID tenantId = requireTenant();
        List<Map<String, Object>> cashiers = cashierService.list(tenantId).stream()
                .map(this::toDto)
                .toList();
        return ResponseEntity.ok(Map.of("data", cashiers));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateRequest request) {
        UUID tenantId = requireTenant();
        Cashier created = cashierService.create(tenantId, request.getName(), request.getPin(), request.getRole());
        return ResponseEntity.ok(Map.of("data", toDto(created)));
    }

    @PostMapping("/{cashierId}/reset-pin")
    public ResponseEntity<?> resetPin(@PathVariable UUID cashierId, @Valid @RequestBody PinRequest request) {
        cashierService.resetPin(requireTenant(), cashierId, request.getPin());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{cashierId}/deactivate")
    public ResponseEntity<?> deactivate(@PathVariable UUID cashierId) {
        cashierService.setActive(requireTenant(), cashierId, false);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{cashierId}/activate")
    public ResponseEntity<?> activate(@PathVariable UUID cashierId) {
        cashierService.setActive(requireTenant(), cashierId, true);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private UUID requireTenant() {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) throw new com.veltronik.v2.core.exceptions.BusinessException("No hay negocio en la sesión.");
        return tenantId;
    }

    /** Sin pinHash: el PIN (ni su hash) jamás sale por la API de gestión. */
    private Map<String, Object> toDto(Cashier cashier) {
        Map<String, Object> dto = new java.util.HashMap<>();
        dto.put("id", cashier.getId());
        dto.put("name", cashier.getName());
        dto.put("role", cashier.getRole().name());
        dto.put("active", cashier.isActive());
        LocalDateTime createdAt = cashier.getCreatedAt();
        dto.put("createdAt", createdAt);
        return dto;
    }
}
