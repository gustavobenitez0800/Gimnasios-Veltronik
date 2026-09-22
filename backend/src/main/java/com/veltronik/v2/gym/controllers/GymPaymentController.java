package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.CoverageGapDTO;
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

    /** Zona del negocio (Argentina): la fecha por defecto del pago es hora AR, no la del server. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    private final GymPaymentService paymentService;
    private final GymPaymentMapper paymentMapper;
    private final com.veltronik.v2.gym.services.LibroDeIngresos libro;

    public GymPaymentController(GymPaymentService paymentService, GymPaymentMapper paymentMapper,
                                com.veltronik.v2.gym.services.LibroDeIngresos libro) {
        this.paymentService = paymentService;
        this.paymentMapper = paymentMapper;
        this.libro = libro;
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
        // El arancel viaja por referencia: el service lo resuelve y verifica que sea del mismo
        // gimnasio, igual que hace con el socio.
        if (input.getPlanId() != null) {
            com.veltronik.v2.gym.entities.GymPlan p = new com.veltronik.v2.gym.entities.GymPlan();
            p.setId(input.getPlanId());
            payment.setPlan(p);
        }
        if (input.getAmount() != null) payment.setAmount(input.getAmount());
        payment.setPaymentDate(input.getPaymentDate() != null ? input.getPaymentDate() : LocalDateTime.now(BUSINESS_ZONE));
        if (input.getPaymentMethod() != null) payment.setPaymentMethod(input.getPaymentMethod());
        if (input.getStatus() != null) payment.setStatus(input.getStatus());
        if (input.getNotes() != null) payment.setNotes(input.getNotes());
        if (input.getPeriodStart() != null) payment.setPeriodStart(input.getPeriodStart());
        if (input.getPeriodEnd() != null) payment.setPeriodEnd(input.getPeriodEnd());
        // El sello del terminal. Lo usa el service para reconocer un reintento ANTES de tocar
        // nada — sin esto, un cobro que se reintenta le regala un mes al socio.
        if (input.getClientRef() != null) payment.setClientRef(input.getClientRef());
        return ResponseEntity.ok(paymentMapper.toDto(paymentService.saveForCurrentTenant(payment)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymPaymentDTO> updatePayment(@PathVariable UUID id, @RequestBody GymPaymentInputDTO input,
                                                       @RequestHeader(value = "X-Cashier-Name", required = false) String quien) {
        // Parche parcial. El socio NO se reasigna en un update (igual que el comportamiento previo).
        // ⚠️ No pasa por el alta: editar un cobro con arancel ya no le regala un mes al socio
        // (ver GymPaymentService.actualizar).
        GymPayment guardado = paymentService.actualizar(id, new GymPaymentService.Cambios(
                input.getAmount(), input.getPaymentDate(), input.getPaymentMethod(), input.getStatus(),
                input.getNotes(), input.getPeriodStart(), input.getPeriodEnd()), quien);
        return ResponseEntity.ok(paymentMapper.toDto(guardado));
    }

    /**
     * ⭐ Anula un cobro. <b>Solo dueño o admin</b>, por lo mismo que el borrado de antes: el robo
     * era cobrar, que el socio se fuera contento, y después hacer desaparecer el cobro.
     *
     * <p>No lo borra: queda tachado, con quién, cuándo y por qué, y deja de sumar en todas partes.
     * Si ya había entrado en un cierre de caja, el próximo cierre lo descuenta a la vista.</p>
     */
    @PostMapping("/{id}/anular")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<java.util.Map<String, Object>> anular(@PathVariable UUID id,
                                                                @RequestBody(required = false) java.util.Map<String, String> body,
                                                                @RequestHeader(value = "X-Cashier-Name", required = false) String quien) {
        String motivo = body == null ? null : body.get("motivo");
        String hechoPor = body != null && body.get("anuladoPor") != null ? body.get("anuladoPor") : quien;
        GymPaymentService.Anulacion a = paymentService.anular(id, motivo, hechoPor);
        java.util.Map<String, Object> salida = new java.util.HashMap<>();
        salida.put("pago", paymentMapper.toDto(a.pago()));
        salida.put("vencimientoRestaurado", a.vencimientoRestaurado());
        return ResponseEntity.ok(salida);
    }

    /**
     * ⭐ Cuánto entró en un rango de días, del LIBRO DE INGRESOS: el mismo número del tablero,
     * de la caja y del Excel. Pagos lo muestra en vez de sumar en el navegador lo que tiene cargado.
     *
     * <p>Por forma de pago y por origen: cuotas cobradas en Veltronik, historial importado, y las
     * ventas y otros ingresos anotados en la caja.</p>
     */
    @GetMapping("/ingresos")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<java.util.Map<String, Object>> ingresos(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        com.veltronik.v2.gym.services.CajaService.validarRango(desde, hasta);
        return ResponseEntity.ok(libro.enLosDias(
                com.veltronik.v2.core.security.TenantContextHolder.getTenantId(), desde, hasta).comoMapa());
    }

    /**
     * El borrado de los escritorios viejos. <b>Ya no borra: anula</b> (ver {@link #anular}).
     * <b>Solo dueño o admin.</b>
     *
     * <p>Acá estaba el agujero más grande del sistema: cualquiera podía borrar. El robo era
     * registrar el cobro —el socio se va contento y su vencimiento se corre—, y más tarde
     * borrarlo y quedarse la plata. Y como borrar un cobro NO recalcula la cobertura, el
     * socio seguía figurando al día y nunca reclamaba: nadie se enteraba jamás.</p>
     *
     * <p>Quien atiende puede corregir un cobro (queda el rastro), pero no hacerlo
     * desaparecer. Si hay que borrar, lo borra el dueño.</p>
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Void> deletePayment(@PathVariable UUID id,
                                              @RequestHeader(value = "X-Cashier-Name", required = false) String quien) {
        paymentService.deleteAndVerifyOwnership(id, quien);
        return ResponseEntity.noContent().build();
    }

    // ── Revisión de pagos huérfanos ────────────────────────────────────────────

    /**
     * Socios que pagaron más allá de la fecha hasta la que figuran cubiertos.
     *
     * <p>Los dejó el bug de los dos pasos (el pago entraba, la request que corría el
     * vencimiento fallaba en silencio). Arreglar el mecanismo no corrige hacia atrás, así
     * que esto alimenta la pantalla donde el dueño los revisa uno por uno.</p>
     *
     * <p>Devuelve lista vacía cuando no hay nada — la sección de Ajustes se esconde sola.</p>
     */
    @GetMapping("/coverage-gaps")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')") // toca fechas de membresía: no es de mostrador
    public ResponseEntity<List<CoverageGapDTO>> getCoverageGaps() {
        return ResponseEntity.ok(paymentService.findCoverageGaps());
    }

    /** Corrige a UN socio: le pone la fecha hasta la que realmente pagó. */
    @PostMapping("/coverage-gaps/{memberId}/fix")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<?> fixCoverageGap(@PathVariable UUID memberId) {
        LocalDateTime applied = paymentService.fixCoverage(memberId);
        // null = no había nada que corregir (ya estaba al día, o lo corrigieron en otra
        // pestaña). No es un error: la pantalla se recarga y la fila desaparece.
        return ResponseEntity.ok(java.util.Collections.singletonMap("membershipEnd", applied));
    }
}
