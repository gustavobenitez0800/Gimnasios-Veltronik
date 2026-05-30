package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.controllers.BaseController;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.services.GymPaymentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/payments")
public class GymPaymentController {

    private final GymPaymentService paymentService;

    public GymPaymentController(GymPaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @GetMapping
    public ResponseEntity<List<GymPayment>> getAllPayments() {
        return ResponseEntity.ok(paymentService.findAllForCurrentTenant());
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymPayment> getPaymentById(@PathVariable UUID id) {
        return ResponseEntity.ok(paymentService.findByIdAndVerifyOwnership(id));
    }

    @PostMapping
    public ResponseEntity<GymPayment> createPayment(@RequestBody GymPayment payment) {
        return ResponseEntity.ok(paymentService.saveForCurrentTenant(payment));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymPayment> updatePayment(@PathVariable UUID id, @RequestBody GymPayment updatedPayment) {
        GymPayment existingPayment = paymentService.findByIdAndVerifyOwnership(id);
        
        // Update fields
        if (updatedPayment.getAmount() != null) existingPayment.setAmount(updatedPayment.getAmount());
        if (updatedPayment.getPaymentDate() != null) existingPayment.setPaymentDate(updatedPayment.getPaymentDate());
        if (updatedPayment.getPaymentMethod() != null) existingPayment.setPaymentMethod(updatedPayment.getPaymentMethod());
        if (updatedPayment.getStatus() != null) existingPayment.setStatus(updatedPayment.getStatus());
        if (updatedPayment.getDescription() != null) existingPayment.setDescription(updatedPayment.getDescription());

        return ResponseEntity.ok(paymentService.saveForCurrentTenant(existingPayment));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable UUID id) {
        paymentService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
