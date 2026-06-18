package com.veltronik.v2.kiosk.controllers;

import com.veltronik.v2.kiosk.dto.KioskAccountMovementDTO;
import com.veltronik.v2.kiosk.dto.KioskAccountPaymentInputDTO;
import com.veltronik.v2.kiosk.dto.KioskCustomerDTO;
import com.veltronik.v2.kiosk.dto.KioskCustomerInputDTO;
import com.veltronik.v2.kiosk.mappers.KioskMapper;
import com.veltronik.v2.kiosk.services.KioskCustomerService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Clientes y cuenta corriente (fiado). Las lecturas quedan abiertas (el POS las necesita para
 * elegir el cliente al fiar); el alta/edición/baja es gestión (OWNER/ADMIN); el pago lo registra
 * quien cobra en el mostrador.
 */
@RestController
@RequestMapping("/api/kiosk/customers")
public class KioskCustomerController {

    private final KioskCustomerService customerService;
    private final KioskMapper mapper;

    public KioskCustomerController(KioskCustomerService customerService, KioskMapper mapper) {
        this.customerService = customerService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<KioskCustomerDTO>> getAll() {
        return ResponseEntity.ok(mapper.toCustomerDtoList(customerService.findAllForCurrentTenant()));
    }

    @GetMapping("/active")
    public ResponseEntity<List<KioskCustomerDTO>> getActive() {
        return ResponseEntity.ok(mapper.toCustomerDtoList(customerService.findActiveForCurrentTenant()));
    }

    @GetMapping("/with-debt")
    public ResponseEntity<List<KioskCustomerDTO>> getWithDebt() {
        return ResponseEntity.ok(mapper.toCustomerDtoList(customerService.findWithDebtForCurrentTenant()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<KioskCustomerDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(customerService.findByIdAndVerifyOwnership(id)));
    }

    @GetMapping("/{id}/movements")
    public ResponseEntity<List<KioskAccountMovementDTO>> getMovements(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toAccountMovementDtoList(customerService.accountMovements(id)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskCustomerDTO> create(@Valid @RequestBody KioskCustomerInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(customerService.create(input)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<KioskCustomerDTO> update(@PathVariable UUID id, @Valid @RequestBody KioskCustomerInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(customerService.update(id, input)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        customerService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    /** El cliente paga (total o parte) su cuenta. */
    @PostMapping("/{id}/payment")
    public ResponseEntity<KioskCustomerDTO> registerPayment(@PathVariable UUID id, @Valid @RequestBody KioskAccountPaymentInputDTO input) {
        return ResponseEntity.ok(mapper.toDto(customerService.registerPayment(id, input.getAmount(), input.getNotes())));
    }
}
