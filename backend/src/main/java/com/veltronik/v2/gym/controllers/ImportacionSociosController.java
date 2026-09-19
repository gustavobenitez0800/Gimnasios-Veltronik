package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.ImportacionSocios.Analisis;
import com.veltronik.v2.gym.dto.ImportacionSocios.Pedido;
import com.veltronik.v2.gym.dto.ImportacionSocios.Resultado;
import com.veltronik.v2.gym.dto.ImportacionSocios.Ultima;
import com.veltronik.v2.gym.services.ImportacionSociosService;
import com.veltronik.v2.gym.services.ImportacionSociosService.ImportacionConErrores;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Importar el padrón de socios desde un archivo. Ver {@link ImportacionSociosService}.
 *
 * <p><b>Solo dueño y administrador.</b> Una importación puede dar de alta cientos de socios o
 * cambiarles el vencimiento a todos de un saque. Es el mismo permiso que borrar un socio o
 * asignar aranceles en masa, y por la misma razón.</p>
 */
@RestController
@RequestMapping("/api/gym/members/importacion")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class ImportacionSociosController {

    private final ImportacionSociosService importador;

    public ImportacionSociosController(ImportacionSociosService importador) {
        this.importador = importador;
    }

    /** Qué pasaría con cada fila. No escribe nada. */
    @PostMapping("/analizar")
    public ResponseEntity<Analisis> analizar(@RequestBody Pedido pedido) {
        return ResponseEntity.ok(importador.analizar(pedido));
    }

    /**
     * Importa. Con una sola fila con error responde 422 con el análisis entero y no escribe
     * nada: la pantalla lo muestra igual que la vista previa.
     */
    @PostMapping
    public ResponseEntity<?> importar(@RequestBody Pedido pedido) {
        try {
            Resultado r = importador.importar(pedido);
            return ResponseEntity.ok(r);
        } catch (ImportacionConErrores e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(e.getAnalisis());
        }
    }

    /** La última importación y si se puede deshacer. 204 si el gimnasio nunca importó. */
    @GetMapping("/ultima")
    public ResponseEntity<Ultima> ultima() {
        return importador.ultima().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/{id}/deshacer")
    public ResponseEntity<Ultima> deshacer(@PathVariable UUID id) {
        return ResponseEntity.ok(importador.deshacer(id));
    }
}
