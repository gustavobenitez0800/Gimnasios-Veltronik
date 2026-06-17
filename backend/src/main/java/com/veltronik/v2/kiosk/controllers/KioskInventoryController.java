package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskStockAdjustmentInputDTO;
import com.veltronik.v2.kiosk.dto.KioskStockMovementDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskProductService;
import com.veltronik.v2.kiosk.services.KioskStockService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Inventario: libro mayor de movimientos + ajustes por recuento. Gestión (dueño/admin):
 *  ajustar stock puede enmascarar faltantes, no es tarea del cajero. */
@RestController
@RequestMapping("/api/kiosk/inventory")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class KioskInventoryController {

    private final KioskStockService stockService;
    private final KioskProductService productService;
    private final KioskMapper mapper;

    public KioskInventoryController(KioskStockService stockService,
                                    KioskProductService productService,
                                    KioskMapper mapper) {
        this.stockService = stockService;
        this.productService = productService;
        this.mapper = mapper;
    }

    /** Últimos movimientos del tenant. */
    @GetMapping("/movements")
    public ResponseEntity<List<KioskStockMovementDTO>> getRecentMovements() {
        return ResponseEntity.ok(mapper.toMovementDtoList(stockService.recentForCurrentTenant()));
    }

    /** Historial de movimientos de un producto. */
    @GetMapping("/movements/product/{productId}")
    public ResponseEntity<List<KioskStockMovementDTO>> getProductMovements(@PathVariable UUID productId) {
        return ResponseEntity.ok(mapper.toMovementDtoList(productService.movementHistory(productId)));
    }

    /** Ajuste manual de stock por recuento físico. */
    @PostMapping("/adjust")
    public ResponseEntity<KioskStockMovementDTO> adjust(@Valid @RequestBody KioskStockAdjustmentInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(productService.adjustStock(input)));
    }
}
