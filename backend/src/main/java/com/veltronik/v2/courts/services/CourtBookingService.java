package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.dto.CourtBookingInputDTO;
import com.veltronik.v2.courts.dto.CourtBookingMoveDTO;
import com.veltronik.v2.courts.entities.*;
import com.veltronik.v2.courts.repositories.CourtBookingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Motor de turnos: creación, drag &amp; drop y máquina de estados.
 *
 * <p><b>Anti doble-reserva en dos capas:</b> (1) chequeo de solapamiento pre-insert con
 * mensaje claro, (2) índice único parcial de la BD {@code (court_id, start_at) WHERE status
 * NOT IN ('CANCELLED','EXPIRED')} que decide las races — la transacción perdedora recibe
 * {@link DataIntegrityViolationException} y se traduce a 409. Por eso los saves usan
 * {@code saveAndFlush} (la violación debe explotar DENTRO del método, no en el commit).</p>
 */
@Service
@Slf4j
public class CourtBookingService {

    static final String SLOT_TAKEN = "Ese horario se acaba de ocupar. Refrescá la grilla.";

    private final CourtBookingRepository bookingRepository;
    private final CourtService courtService;
    private final CourtCustomerService customerService;
    private final CourtSettingsService settingsService;
    private final CourtPriceRuleService priceRuleService;

    public CourtBookingService(CourtBookingRepository bookingRepository,
                               CourtService courtService,
                               CourtCustomerService customerService,
                               CourtSettingsService settingsService,
                               CourtPriceRuleService priceRuleService) {
        this.bookingRepository = bookingRepository;
        this.courtService = courtService;
        this.customerService = customerService;
        this.settingsService = settingsService;
        this.priceRuleService = priceRuleService;
    }

    /** Turnos del día [00:00, 24:00) del tenant, para la grilla. 1 sola query (JOIN FETCH). */
    public List<CourtBooking> findByDateForCurrentTenant(LocalDate date) {
        return bookingRepository.findGridBookings(
                TenantContextHolder.getTenantId(),
                date.atStartOfDay(),
                date.plusDays(1).atStartOfDay());
    }

    public CourtBooking findByIdAndVerifyOwnership(UUID id) {
        CourtBooking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Turno no encontrado"));
        if (!booking.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este turno");
        }
        return booking;
    }

    @Transactional
    public CourtBooking create(CourtBookingInputDTO in) {
        UUID tenantId = TenantContextHolder.getTenantId();
        Court court = courtService.findByIdAndVerifyOwnership(in.getCourtId());
        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();

        CourtBookingStatus status = parseCreatableStatus(in.getStatus());

        LocalDateTime startAt = in.getStartAt();
        LocalDateTime endAt = (in.getEndAt() != null)
                ? in.getEndAt()
                : startAt.plusMinutes(settings.getSlotDurationMinutes());
        if (!endAt.isAfter(startAt)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El fin del turno debe ser posterior al inicio");
        }

        CourtBooking booking = new CourtBooking();
        booking.setTenant(court.getTenant());
        booking.setCourt(court);
        booking.setStartAt(startAt);
        booking.setEndAt(endAt);
        booking.setStatus(status);
        booking.setNotes(in.getNotes());

        if (status != CourtBookingStatus.MAINTENANCE) {
            booking.setCustomer(resolveCustomer(in));
            booking.setTotalPrice(in.getTotalPrice() != null
                    ? in.getTotalPrice()
                    : priceRuleService.resolvePrice(tenantId, court.getId(), startAt, settings.getDefaultPrice()));
        }

        if (status == CourtBookingStatus.PENDING_DEPOSIT) {
            BigDecimal deposit = (in.getDepositAmount() != null)
                    ? in.getDepositAmount() : settings.getDepositAmount();
            booking.setDepositAmount(deposit);
            booking.setExpiresAt(LocalDateTime.now().plusMinutes(settings.getDepositTimeoutMinutes()));
        } else if (in.getDepositAmount() != null) {
            // Turno confirmado con seña ya cobrada en mano.
            booking.setDepositAmount(in.getDepositAmount());
            booking.setDepositPaidAt(LocalDateTime.now());
        }

        return saveCheckingSlot(booking, null);
    }

    /** Edición de datos del turno (precio, seña, notas, cliente). Cancha/horario van por move(). */
    @Transactional
    public CourtBooking update(UUID id, CourtBookingInputDTO in) {
        CourtBooking booking = findByIdAndVerifyOwnership(id);
        if (in.getTotalPrice() != null) booking.setTotalPrice(in.getTotalPrice());
        if (in.getDepositAmount() != null) booking.setDepositAmount(in.getDepositAmount());
        if (in.getNotes() != null) booking.setNotes(in.getNotes());
        if (booking.getStatus() != CourtBookingStatus.MAINTENANCE
                && (in.getCustomerId() != null || hasInlineCustomer(in))) {
            booking.setCustomer(resolveCustomer(in));
        }
        return bookingRepository.save(booking);
    }

    /** Drag & drop: mover a otra cancha y/u horario conservando la duración. */
    @Transactional
    public CourtBooking move(UUID id, CourtBookingMoveDTO moveTo) {
        CourtBooking booking = findByIdAndVerifyOwnership(id);
        if (!isAlive(booking.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden mover turnos vigentes (no cancelados/finalizados)");
        }
        Court targetCourt = courtService.findByIdAndVerifyOwnership(moveTo.getCourtId());
        Duration duration = Duration.between(booking.getStartAt(), booking.getEndAt());
        booking.setCourt(targetCourt);
        booking.setStartAt(moveTo.getStartAt());
        booking.setEndAt(moveTo.getStartAt().plus(duration));
        return saveCheckingSlot(booking, booking.getId());
    }

    // ─────────────────── transiciones de la máquina de estados ───────────────────

    /** Seña recibida (en mano hoy; vía webhook MP en Fase 1.5). */
    @Transactional
    public CourtBooking confirm(UUID id) {
        CourtBooking b = requireStatus(id, "confirmar", CourtBookingStatus.PENDING_DEPOSIT);
        b.setStatus(CourtBookingStatus.CONFIRMED);
        b.setDepositPaidAt(LocalDateTime.now());
        b.setExpiresAt(null);
        return bookingRepository.save(b);
    }

    @Transactional
    public CourtBooking cancel(UUID id) {
        CourtBooking b = requireStatus(id, "cancelar",
                CourtBookingStatus.PENDING_DEPOSIT, CourtBookingStatus.CONFIRMED, CourtBookingStatus.MAINTENANCE);
        b.setStatus(CourtBookingStatus.CANCELLED);
        b.setExpiresAt(null);
        return bookingRepository.save(b);
    }

    @Transactional
    public CourtBooking complete(UUID id) {
        CourtBooking b = requireStatus(id, "cerrar", CourtBookingStatus.CONFIRMED);
        b.setStatus(CourtBookingStatus.COMPLETED);
        return bookingRepository.save(b);
    }

    @Transactional
    public CourtBooking noShow(UUID id) {
        CourtBooking b = requireStatus(id, "marcar como no-show", CourtBookingStatus.CONFIRMED);
        b.setStatus(CourtBookingStatus.NO_SHOW);
        if (b.getCustomer() != null) {
            b.getCustomer().setNoShowCount(b.getCustomer().getNoShowCount() + 1);
        }
        return bookingRepository.save(b);
    }

    /**
     * Cron (corre sin contexto de tenant, barre todos): libera las señas vencidas.
     * @return cantidad de turnos expirados.
     */
    @Transactional
    public int expireOverdueDeposits() {
        List<CourtBooking> overdue = bookingRepository.findByStatusAndExpiresAtBefore(
                CourtBookingStatus.PENDING_DEPOSIT, LocalDateTime.now());
        for (CourtBooking b : overdue) {
            b.setStatus(CourtBookingStatus.EXPIRED);
            log.info("Seña vencida: turno {} ({} {}) liberado.",
                    b.getId(), b.getCourt().getName(), b.getStartAt());
        }
        bookingRepository.saveAll(overdue);
        return overdue.size();
    }

    // ─────────────────────────────── helpers ───────────────────────────────

    /** Estados que ocupan slot y pueden moverse/cancelarse. */
    private static boolean isAlive(CourtBookingStatus s) {
        return s == CourtBookingStatus.PENDING_DEPOSIT
                || s == CourtBookingStatus.CONFIRMED
                || s == CourtBookingStatus.MAINTENANCE;
    }

    private CourtBooking requireStatus(UUID id, String action, CourtBookingStatus... allowed) {
        CourtBooking b = findByIdAndVerifyOwnership(id);
        for (CourtBookingStatus s : allowed) {
            if (b.getStatus() == s) return b;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "No se puede " + action + " un turno en estado " + b.getStatus());
    }

    private static CourtBookingStatus parseCreatableStatus(String raw) {
        if (raw == null || raw.isBlank()) return CourtBookingStatus.CONFIRMED;
        CourtBookingStatus status;
        try {
            status = CourtBookingStatus.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado inválido: " + raw);
        }
        if (!isAlive(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Un turno nuevo solo puede nacer CONFIRMED, PENDING_DEPOSIT o MAINTENANCE");
        }
        return status;
    }

    private static boolean hasInlineCustomer(CourtBookingInputDTO in) {
        return in.getCustomerPhone() != null && !in.getCustomerPhone().isBlank();
    }

    private CourtCustomer resolveCustomer(CourtBookingInputDTO in) {
        if (in.getCustomerId() != null) {
            return customerService.findByIdAndVerifyOwnership(in.getCustomerId());
        }
        if (hasInlineCustomer(in)) {
            return customerService.findOrCreate(in.getCustomerName(), in.getCustomerPhone());
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "El turno necesita un cliente (customerId o customerName + customerPhone)");
    }

    /** Solapamiento de cortesía + flush para que la race la decida el índice único (→ 409). */
    private CourtBooking saveCheckingSlot(CourtBooking booking, UUID excludeId) {
        boolean taken = (excludeId == null)
                ? bookingRepository.existsOverlapping(
                        booking.getCourt().getId(), booking.getStartAt(), booking.getEndAt())
                : bookingRepository.existsOverlappingExcluding(
                        booking.getCourt().getId(), booking.getStartAt(), booking.getEndAt(), excludeId);
        if (taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, SLOT_TAKEN);
        }
        try {
            return bookingRepository.saveAndFlush(booking);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, SLOT_TAKEN);
        }
    }
}
