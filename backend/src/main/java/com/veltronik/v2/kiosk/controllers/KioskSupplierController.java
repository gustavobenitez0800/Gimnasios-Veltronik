package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskSupplierDTO;
import com.veltronik.v2.kiosk.dto.KioskSupplierInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskSupplierService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Proveedores. Gestión (compras y costos) → solo OWNER/ADMIN. */
@RestController
@RequestMapping("/api/kiosk/suppliers")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class KioskSupplierController {

    private final KioskSupplierService supplierService;
    private final KioskMapper mapper;

    public KioskSupplierController(KioskSupplierService supplierService, KioskMapper mapper) {
        this.supplierService = supplierService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<KioskSupplierDTO>> getAll() {
        return ResponseEntity.ok(mapper.toSupplierDtoList(supplierService.findAllForCurrentTenant()));
    }

    @GetMapping("/active")
    public ResponseEntity<List<KioskSupplierDTO>> getActive() {
        return ResponseEntity.ok(mapper.toSupplierDtoList(supplierService.findActiveForCurrentTenant()));
    }

    @PostMapping
    public ResponseEntity<KioskSupplierDTO> create(@Valid @RequestBody KioskSupplierInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(supplierService.create(input)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<KioskSupplierDTO> update(@PathVariable UUID id, @Valid @RequestBody KioskSupplierInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(supplierService.update(id, input)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        supplierService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
