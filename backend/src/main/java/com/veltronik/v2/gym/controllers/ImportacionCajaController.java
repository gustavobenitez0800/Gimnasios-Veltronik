package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.ImportacionCaja.Analisis;
import com.veltronik.v2.gym.dto.ImportacionCaja.Pedido;
import com.veltronik.v2.gym.dto.ImportacionCaja.Ultima;
import com.veltronik.v2.gym.services.ImportacionCajaService;
import com.veltronik.v2.gym.services.ImportacionCajaService.ImportacionConErrores;
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
 * Importar el historial de caja de otro sistema. Ver {@link ImportacionCajaService} y ADR-014.
 *
 * <p><b>Solo dueño y administrador</b>, igual que el listado de pagos: son los ingresos del
 * gimnasio mes por mes, y una importación carga miles de cobros de un saque.</p>
 */
@RestController
@RequestMapping("/api/gym/payments/importacion")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class ImportacionCajaController {

    private final ImportacionCajaService importador;

    public ImportacionCajaController(ImportacionCajaService importador) {
        this.importador = importador;
    }

    /** Qué pasaría con cada fila. No escribe nada. */
    @PostMapping("/analizar")
    public ResponseEntity<Analisis> analizar(@RequestBody Pedido pedido) {
        return ResponseEntity.ok(importador.analizar(pedido));
    }

    /** Importa. Con una sola fila con error responde 422 con el análisis entero y no escribe nada. */
    @PostMapping
    public ResponseEntity<?> importar(@RequestBody Pedido pedido) {
        try {
            return ResponseEntity.ok(importador.importar(pedido));
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
