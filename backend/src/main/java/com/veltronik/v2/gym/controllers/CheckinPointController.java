package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.entities.CheckinPoint;
import com.veltronik.v2.gym.services.CheckinService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * El cartel del check-in, del lado del gimnasio: verlo, imprimirlo, rotarlo.
 *
 * <p>Solo dueño y administrador: el token que sale de acá es lo que autoriza a marcar entradas
 * en este gimnasio. Quien lo tenga puede registrar accesos, así que no es un dato de mostrador.</p>
 */
@RestController
@RequestMapping("/api/gym/checkin-points")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class CheckinPointController {

    private final CheckinService checkinService;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listar() {
        List<Map<String, Object>> body = checkinService.puntosActivos().stream()
                .map(CheckinPointController::toMap)
                .toList();
        return ResponseEntity.ok(body);
    }

    /**
     * Crea un cartel. Con {@code reemplazar} rota uno existente: el viejo queda apagado y deja
     * de funcionar, que es exactamente lo que hace falta el día que alguien fotografía el cartel
     * y empieza a marcar entradas desde su casa.
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> crear(@RequestBody(required = false) Map<String, String> body) {
        String nombre = body == null ? null : body.get("nombre");
        String reemplazarRaw = body == null ? null : body.get("reemplazar");

        UUID reemplazar = null;
        if (reemplazarRaw != null && !reemplazarRaw.isBlank()) {
            try {
                reemplazar = UUID.fromString(reemplazarRaw.trim());
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(Map.of("error", "El cartel a reemplazar no es válido."));
            }
        }

        return ResponseEntity.ok(toMap(checkinService.crearPunto(nombre, reemplazar)));
    }

    private static Map<String, Object> toMap(CheckinPoint p) {
        return Map.of(
                "id", p.getId(),
                "nombre", p.getName(),
                "token", p.getToken(),
                "creado", p.getCreatedAt());
    }
}
