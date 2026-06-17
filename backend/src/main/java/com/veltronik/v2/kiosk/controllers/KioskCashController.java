package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskCashCloseInputDTO;
import com.veltronik.v2.kiosk.dto.KioskCashOpenInputDTO;
import com.veltronik.v2.kiosk.dto.KioskCashSessionDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskCashService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Caja: apertura, cierre con arqueo e historial. */
@RestController
@RequestMapping("/api/kiosk/cash")
public class KioskCashController {

    private final KioskCashService cashService;
    private final KioskMapper mapper;

    public KioskCashController(KioskCashService cashService, KioskMapper mapper) {
        this.cashService = cashService;
        this.mapper = mapper;
    }

    /** Caja abierta actual (204 si no hay ninguna). */
    @GetMapping("/current")
    public ResponseEntity<KioskCashSessionDTO> getCurrent() {
        return cashService.findCurrentOpen()
                .map(s -> ResponseEntity.ok(mapper.toDto(s)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/history")
    public ResponseEntity<List<KioskCashSessionDTO>> getHistory() {
        return ResponseEntity.ok(mapper.toCashSessionDtoList(cashService.historyForCurrentTenant()));
    }

    @PostMapping("/open")
    public ResponseEntity<KioskCashSessionDTO> open(@Valid @RequestBody KioskCashOpenInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(cashService.open(input)));
    }

    @PostMapping("/close")
    public ResponseEntity<KioskCashSessionDTO> close(@Valid @RequestBody KioskCashCloseInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(cashService.close(input)));
    }
}
