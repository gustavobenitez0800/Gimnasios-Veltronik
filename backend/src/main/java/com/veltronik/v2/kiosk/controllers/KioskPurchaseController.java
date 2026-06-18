package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskPurchaseDTO;
import com.veltronik.v2.kiosk.dto.KioskPurchaseInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskPurchaseService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Compras a proveedores (reponen stock y actualizan costos). Gestión → solo OWNER/ADMIN. */
@RestController
@RequestMapping("/api/kiosk/purchases")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class KioskPurchaseController {

    private final KioskPurchaseService purchaseService;
    private final KioskMapper mapper;

    public KioskPurchaseController(KioskPurchaseService purchaseService, KioskMapper mapper) {
        this.purchaseService = purchaseService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<KioskPurchaseDTO>> getRecent() {
        return ResponseEntity.ok(mapper.toPurchaseDtoList(purchaseService.findRecentForCurrentTenant()));
    }

    @PostMapping
    public ResponseEntity<KioskPurchaseDTO> register(@Valid @RequestBody KioskPurchaseInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(purchaseService.register(input)));
    }
}
