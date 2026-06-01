package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymPaymentDTO;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.mappers.GymPaymentMapper;
import com.veltronik.v2.gym.services.GymPaymentService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * API REST de pagos del gimnasio.
 *
 * Devuelve SIEMPRE {@link GymPaymentDTO} (nunca la entidad JPA cruda), con el socio
 * resuelto en el backend. El frontend solo dibuja el contrato que define este DTO.
 */
@RestController
@RequestMapping("/api/gym/payments")
public class GymPaymentController {

    private final GymPaymentService paymentService;
    private final GymPaymentMapper paymentMapper;

    public GymPaymentController(GymPaymentService paymentService, GymPaymentMapper paymentMapper) {
        this.paymentService = paymentService;
        this.paymentMapper = paymentMapper;
    }

    /**
     * Lista de pagos del tenant. Acepta filtro de rango de fecha OPCIONAL:
     *  - sin params  → todos (compatibilidad con consumidores existentes).
     *  - {@code ?from=YYYY-MM-DD&to=YYYY-MM-DD} → filtra por paymentDate (inclusive).
     * El filtrado se hace en la BD (el frontend solo dibuja el resultado).
     */
    @GetMapping
    public ResponseEntity<List<GymPaymentDTO>> getAllPayments(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        List<GymPaymentDTO> result = (from == null && to == null)
                ? paymentMapper.toDtoList(paymentService.findAllForCurrentTenant())
                : paymentMapper.toDtoList(paymentService.findForCurrentTenantByDateRange(from, to));
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymPaymentDTO> getPaymentById(@PathVariable UUID id) {
        return ResponseEntity.ok(paymentMapper.toDto(paymentService.findByIdAndVerifyOwnership(id)));
    }

    /** Historial de pagos de un socio (usado por el modal de MembersPage). */
    @GetMapping("/member/{memberId}")
    public ResponseEntity<List<GymPaymentDTO>> getPaymentsByMember(@PathVariable UUID memberId) {
        return ResponseEntity.ok(paymentMapper.toDtoList(paymentService.findByMemberIdForCurrentTenant(memberId)));
    }

    @PostMapping
    public ResponseEntity<GymPaymentDTO> createPayment(@RequestBody GymPayment payment) {
        return ResponseEntity.ok(paymentMapper.toDto(paymentService.saveForCurrentTenant(payment)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymPaymentDTO> updatePayment(@PathVariable UUID id, @RequestBody GymPayment updatedPayment) {
        GymPayment existingPayment = paymentService.findByIdAndVerifyOwnership(id);

        // Update fields
        if (updatedPayment.getAmount() != null) existingPayment.setAmount(updatedPayment.getAmount());
        if (updatedPayment.getPaymentDate() != null) existingPayment.setPaymentDate(updatedPayment.getPaymentDate());
        if (updatedPayment.getPaymentMethod() != null) existingPayment.setPaymentMethod(updatedPayment.getPaymentMethod());
        if (updatedPayment.getStatus() != null) existingPayment.setStatus(updatedPayment.getStatus());

        if (updatedPayment.getNotes() != null) existingPayment.setNotes(updatedPayment.getNotes());
        if (updatedPayment.getPeriodStart() != null) existingPayment.setPeriodStart(updatedPayment.getPeriodStart());
        if (updatedPayment.getPeriodEnd() != null) existingPayment.setPeriodEnd(updatedPayment.getPeriodEnd());

        return ResponseEntity.ok(paymentMapper.toDto(paymentService.saveForCurrentTenant(existingPayment)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable UUID id) {
        paymentService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
