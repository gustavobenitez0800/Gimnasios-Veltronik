package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.services.AccountDeletionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Borrar la cuenta: pedirlo, consultarlo y arrepentirse.
 *
 * <p><b>Va bajo {@code /api/account} y NO bajo un gimnasio</b> porque lo que se borra es la
 * persona, no un negocio. Un dueño con tres sucursales borra las tres, y no habría forma de
 * elegir "desde cuál" pedirlo.</p>
 *
 * <p><b>Fuera del KillSwitch a propósito.</b> Durante los 30 días el sistema está cerrado —esa
 * es la decisión— pero el arrepentimiento tiene que seguir funcionando. Si estas rutas
 * pasaran por el filtro de acceso, la única puerta para cancelar el borrado estaría cerrada
 * con llave por el mismo borrado que se quiere cancelar.</p>
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountDeletionController {

    private final AccountDeletionService deletionService;

    /** Estado del borrado de MI cuenta. Lo consulta la pantalla en cada arranque. */
    @GetMapping("/deletion")
    public ResponseEntity<?> estado() {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(deletionService.consultar(userId));
    }

    /**
     * Pide el borrado. Corta el cobro y arranca la cuenta regresiva.
     *
     * <p>La confirmación fuerte —escribir el nombre del gimnasio— vive en la pantalla, no acá:
     * es una barrera contra el clic distraído, no contra un atacante. Quien llame a este
     * endpoint a mano ya está autenticado y es dueño de lo que borra.</p>
     */
    @PostMapping("/deletion")
    public ResponseEntity<?> solicitar() {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        try {
            return ResponseEntity.ok(deletionService.solicitar(userId));
        } catch (IllegalStateException e) {
            // El caso más importante: no se pudo cortar el cobro. El mensaje del servicio
            // explica por qué NO se marcó nada, y ese texto sí es para el cliente.
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    /** El arrepentimiento. Devuelve los gimnasios a la normalidad. */
    @DeleteMapping("/deletion")
    public ResponseEntity<?> cancelar() {
        UUID userId = SecurityUtils.getCurrentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(deletionService.cancelar(userId));
    }
}
