package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskCategoryDTO;
import com.veltronik.v2.kiosk.dto.KioskCategoryInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskCategoryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Rubros de la góndola. Lectura: cualquier rol; alta/edición/baja: dueño/admin. */
@RestController
@RequestMapping("/api/kiosk/categories")
public class KioskCategoryController {

    private final KioskCategoryService categoryService;
    private final KioskMapper mapper;

    public KioskCategoryController(KioskCategoryService categoryService, KioskMapper mapper) {
        this.categoryService = categoryService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<KioskCategoryDTO>> getAll() {
        return ResponseEntity.ok(mapper.toCategoryDtoList(categoryService.findAllForCurrentTenant()));
    }

    @GetMapping("/active")
    public ResponseEntity<List<KioskCategoryDTO>> getActive() {
        return ResponseEntity.ok(mapper.toCategoryDtoList(categoryService.findActiveForCurrentTenant()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskCategoryDTO> create(@Valid @RequestBody KioskCategoryInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(categoryService.create(input)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskCategoryDTO> update(@PathVariable UUID id, @Valid @RequestBody KioskCategoryInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(categoryService.update(id, input)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        categoryService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
