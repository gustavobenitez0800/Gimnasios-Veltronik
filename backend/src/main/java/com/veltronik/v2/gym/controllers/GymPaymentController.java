package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymPaymentDTO;
import com.veltronik.v2.gym.dto.GymPaymentInputDTO;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.mappers.GymPaymentMapper;
import com.veltronik.v2.gym.services.GymPaymentService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * API REST de pagos del gimnasio.
 *
 * Devuelve SIEMPRE {@link GymPaymentDTO} (nunca la entidad JPA cruda), con el socio
 * resuelto en el backend. La ENTRADA usa {@link GymPaymentInputDTO} (no la entidad cruda)
 * para cerrar el mass-assignment. El frontend solo dibuja el contrato que define el DTO.
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
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')") // listado/reporte de ingresos: solo dueño/admin
    public ResponseEntity<List<GymPaymentDTO>> getAllPayments(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        List<GymPaymentDTO> result = (from == null && to == null)
                ? paymentMapper.toDtoList(paymentService.findAllForCurrentTenant())
                : paymentMapper.toDtoList(paymentService.findForCurrentTenantByDateRange(from, to));
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')") // detalle de un pago: solo dueño/admin
    public ResponseEntity<GymPaymentDTO> getPaymentById(@PathVariable UUID id) {
        return ResponseEntity.ok(paymentMapper.toDto(paymentService.findByIdAndVerifyOwnership(id)));
    }

    /** Historial de pagos de un socio (usado por el modal de MembersPage). */
    @GetMapping("/member/{memberId}")
    public ResponseEntity<List<GymPaymentDTO>> getPaymentsByMember(@PathVariable UUID memberId) {
        return ResponseEntity.ok(paymentMapper.toDtoList(paymentService.findByMemberIdForCurrentTenant(memberId)));
    }

    @PostMapping
    public ResponseEntity<GymPaymentDTO> createPayment(@RequestBody GymPaymentInputDTO input) {
        GymPayment payment = new GymPayment();
        // setMemberId arma la referencia mínima (id); el service la resuelve y verifica el tenant.
        if (input.getMemberId() != null) payment.setMemberId(input.getMemberId());
        if (input.getAmount() != null) payment.setAmount(input.getAmount());
        payment.setPaymentDate(input.getPaymentDate() != null ? input.getPaymentDate() : LocalDateTime.now());
        if (input.getPaymentMethod() != null) payment.setPaymentMethod(input.getPaymentMethod());
        if (input.getStatus() != null) payment.setStatus(input.getStatus());
        if (input.getNotes() != null) payment.setNotes(input.getNotes());
        if (input.getPeriodStart() != null) payment.setPeriodStart(input.getPeriodStart());
        if (input.getPeriodEnd() != null) payment.setPeriodEnd(input.getPeriodEnd());
        return ResponseEntity.ok(paymentMapper.toDto(paymentService.saveForCurrentTenant(payment)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymPaymentDTO> updatePayment(@PathVariable UUID id, @RequestBody GymPaymentInputDTO input) {
        GymPayment existingPayment = paymentService.findByIdAndVerifyOwnership(id);

        // Parche parcial. El socio NO se reasigna en un update (igual que el comportamiento previo).
        if (input.getAmount() != null) existingPayment.setAmount(input.getAmount());
        if (input.getPaymentDate() != null) existingPayment.setPaymentDate(input.getPaymentDate());
        if (input.getPaymentMethod() != null) existingPayment.setPaymentMethod(input.getPaymentMethod());
        if (input.getStatus() != null) existingPayment.setStatus(input.getStatus());
        if (input.getNotes() != null) existingPayment.setNotes(input.getNotes());
        if (input.getPeriodStart() != null) existingPayment.setPeriodStart(input.getPeriodStart());
        if (input.getPeriodEnd() != null) existingPayment.setPeriodEnd(input.getPeriodEnd());

        return ResponseEntity.ok(paymentMapper.toDto(paymentService.saveForCurrentTenant(existingPayment)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable UUID id) {
        paymentService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
