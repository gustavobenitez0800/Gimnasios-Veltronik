package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymPaymentDTO;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.mappers.GymPaymentMapper;
import com.veltronik.v2.gym.services.GymPaymentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    @GetMapping
    public ResponseEntity<List<GymPaymentDTO>> getAllPayments() {
        return ResponseEntity.ok(paymentMapper.toDtoList(paymentService.findAllForCurrentTenant()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymPaymentDTO> getPaymentById(@PathVariable UUID id) {
        return ResponseEntity.ok(paymentMapper.toDto(paymentService.findByIdAndVerifyOwnership(id)));
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
