package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.services.ClaveDeCobroService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * La clave para cobrar de la sucursal (ver {@link ClaveDeCobroService}).
 *
 * <p>Saber si está puesta y comprobarla lo puede cualquiera del mostrador: es lo que pide la
 * pantalla antes de cobrar. Ponerla, cambiarla o sacarla, solo el dueño o un admin, y sabiendo la
 * actual.</p>
 */
@RestController
@RequestMapping("/api/gym/clave-de-cobro")
@RequiredArgsConstructor
public class ClaveDeCobroController {

    private final ClaveDeCobroService service;

    public record Fijar(String nueva, String actual) {}

    public record Clave(String clave) {}

    @GetMapping
    public ResponseEntity<Map<String, Object>> estado() {
        return ResponseEntity.ok(Map.of("activa", service.activa()));
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> fijar(@RequestBody Fijar input) {
        service.fijar(input == null ? null : input.nueva(), input == null ? null : input.actual());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sacar")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> sacar(@RequestBody Clave input) {
        service.sacar(input == null ? null : input.clave());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/verificar")
    public ResponseEntity<Void> verificar(@RequestBody Clave input) {
        service.verificar(input == null ? null : input.clave());
        return ResponseEntity.noContent().build();
    }
}
