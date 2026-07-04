package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.security.LocalPrincipal;
import com.veltronik.v2.core.security.LocalSessionService;
import com.veltronik.v2.core.services.CashierService;
import com.veltronik.v2.sync.SyncIdentity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Login del cajero contra el CEREBRO LOCAL (ladrillo 6): entra por PIN, sin Google ni
 * internet. Solo existe en el perfil {@code local} — en la nube este controller no carga.
 *
 * <p>Ambos endpoints son {@code permitAll} (son el login en sí): {@code /status} para que
 * la app sepa que está frente a un cerebro local listo, y {@code /login} para canjear el
 * PIN por un token de sesión.</p>
 */
@RestController
@RequestMapping("/api/local")
@Profile("local")
@RequiredArgsConstructor
public class LocalAuthController {

    private final SyncIdentity syncIdentity;
    private final CashierService cashierService;
    private final LocalSessionService localSessionService;

    @Data
    public static class LoginRequest {
        @NotBlank(message = "Ingresá tu PIN")
        private String pin;
    }

    /** ¿Este cerebro local está enrolado y listo para recibir logins? */
    @GetMapping("/status")
    public ResponseEntity<?> status() {
        UUID tenantId = syncIdentity.resolve().map(SyncIdentity.Identity::tenantId).orElse(null);
        return ResponseEntity.ok(Map.of(
                "mode", "local",
                "ready", tenantId != null,
                "tenantId", Optional.ofNullable(tenantId).map(UUID::toString).orElse("")));
    }

    /** Canjea el PIN por un token de sesión local. */
    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        UUID tenantId = syncIdentity.resolve().map(SyncIdentity.Identity::tenantId).orElse(null);
        if (tenantId == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "NOT_ENROLLED",
                    "message", "Este equipo todavía no está enrolado a una sucursal. Enrolalo desde la nube."));
        }

        Optional<Cashier> cashier = cashierService.verifyPin(tenantId, request.getPin());
        if (cashier.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "error", "BAD_PIN",
                    "message", "PIN incorrecto."));
        }

        Cashier c = cashier.get();
        String token = localSessionService.issue(new LocalPrincipal(c.getId(), tenantId, c.getRole(), c.getName()));
        return ResponseEntity.ok(Map.of(
                "token", token,
                "expiresInSeconds", localSessionService.ttlSeconds(),
                "cashier", Map.of("id", c.getId(), "name", c.getName(), "role", c.getRole().name())));
    }
}
