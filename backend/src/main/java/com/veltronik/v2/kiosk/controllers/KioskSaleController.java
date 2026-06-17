package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskSaleDTO;
import com.veltronik.v2.kiosk.dto.KioskSaleInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskSaleService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Motor de ventas (POS). Vender es operación de mostrador (cualquier rol). Anular una venta,
 * en cambio, es el vector de robo clásico (el cajero anula y se queda el efectivo) → solo dueño/admin.
 */
@RestController
@RequestMapping("/api/kiosk/sales")
public class KioskSaleController {

    private final KioskSaleService saleService;
    private final KioskMapper mapper;

    public KioskSaleController(KioskSaleService saleService, KioskMapper mapper) {
        this.saleService = saleService;
        this.mapper = mapper;
    }

    /** Registra una venta. Idempotente por {@code clientUuid} (offline-ready). */
    @PostMapping
    public ResponseEntity<KioskSaleDTO> register(@Valid @RequestBody KioskSaleInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(saleService.register(input)));
    }

    /** Ventas del día (para el listado y el cierre de caja). */
    @GetMapping("/today")
    public ResponseEntity<List<KioskSaleDTO>> getToday() {
        return ResponseEntity.ok(mapper.toSaleDtoList(saleService.findTodayForCurrentTenant()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<KioskSaleDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(saleService.findDetailById(id)));
    }

    /** Anula una venta (devuelve el stock). Solo dueño/admin (anti-robo). */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskSaleDTO> voidSale(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(saleService.voidSale(id)));
    }
}
