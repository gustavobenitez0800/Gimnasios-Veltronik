package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskProductDTO;
import com.veltronik.v2.kiosk.dto.KioskProductInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskProductService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Productos del kiosco + lookup por código de barras para el POS.
 *
 * <p>Lectura (catálogo, barcode): cualquier rol — el POS necesita leer. Altas/ediciones/bajas
 * (precios, catálogo): solo dueño/admin.</p>
 */
@RestController
@RequestMapping("/api/kiosk/products")
public class KioskProductController {

    private final KioskProductService productService;
    private final KioskMapper mapper;

    public KioskProductController(KioskProductService productService, KioskMapper mapper) {
        this.productService = productService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<KioskProductDTO>> getAll() {
        return ResponseEntity.ok(mapper.toProductDtoList(productService.findAllForCurrentTenant()));
    }

    @GetMapping("/active")
    public ResponseEntity<List<KioskProductDTO>> getActive() {
        return ResponseEntity.ok(mapper.toProductDtoList(productService.findActiveForCurrentTenant()));
    }

    @GetMapping("/low-stock")
    public ResponseEntity<List<KioskProductDTO>> getLowStock() {
        return ResponseEntity.ok(mapper.toProductDtoList(productService.findLowStockForCurrentTenant()));
    }

    /** Búsqueda por código de barras del scanner. */
    @GetMapping("/barcode/{barcode}")
    public ResponseEntity<KioskProductDTO> getByBarcode(@PathVariable String barcode) {
        return ResponseEntity.ok(mapper.toDto(productService.findByBarcodeOrThrow(barcode)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<KioskProductDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(productService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskProductDTO> create(@Valid @RequestBody KioskProductInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(productService.create(input)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskProductDTO> update(@PathVariable UUID id, @Valid @RequestBody KioskProductInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(productService.update(id, input)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        productService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
