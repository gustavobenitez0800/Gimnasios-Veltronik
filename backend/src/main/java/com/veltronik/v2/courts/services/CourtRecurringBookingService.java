package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.entities.*;
import com.veltronik.v2.courts.repositories.CourtBookingRepository;
import com.veltronik.v2.courts.repositories.CourtRecurringBookingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Turnos fijos semanales ("los lunes 21hs la tiene Juan").
 *
 * <p>La plantilla NO ocupa la grilla: se MATERIALIZA como {@link CourtBooking} CONFIRMED
 * para las próximas {@value #HORIZON_DAYS} jornadas, al crearla/activarla y por un job
 * diario. La materialización es idempotente (chequea {@code recurring_id + start_at}) y
 * si el slot lo ganó otra reserva, esa fecha se saltea con un log (el índice único decide).</p>
 */
@Service
@Slf4j
public class CourtRecurringBookingService {

    /** Cuántos días hacia adelante se materializan las instancias del turno fijo. */
    static final int HORIZON_DAYS = 28;

    private final CourtRecurringBookingRepository recurringRepository;
    private final CourtBookingRepository bookingRepository;
    private final CourtPriceRuleService priceRuleService;
    private final CourtSettingsService settingsService;

    public CourtRecurringBookingService(CourtRecurringBookingRepository recurringRepository,
                                        CourtBookingRepository bookingRepository,
                                        CourtPriceRuleService priceRuleService,
                                        CourtSettingsService settingsService) {
        this.recurringRepository = recurringRepository;
        this.bookingRepository = bookingRepository;
        this.priceRuleService = priceRuleService;
        this.settingsService = settingsService;
    }

    public List<CourtRecurringBooking> findAllForCurrentTenant() {
        return recurringRepository.findByTenantIdOrderByDayOfWeekAscStartTimeAsc(TenantContextHolder.getTenantId());
    }

    public CourtRecurringBooking findByIdAndVerifyOwnership(UUID id) {
        CourtRecurringBooking r = recurringRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Turno fijo no encontrado"));
        if (!r.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado a este turno fijo");
        }
        return r;
    }

    /** Alta/edición + materialización inmediata (el dueño ve los turnos en la grilla al toque). */
    @Transactional
    public CourtRecurringBooking saveForCurrentTenant(CourtRecurringBooking recurring) {
        if (recurring.getTenant() == null) {
            com.veltronik.v2.core.entities.Tenant tenant = new com.veltronik.v2.core.entities.Tenant();
            tenant.setId(TenantContextHolder.getTenantId());
            recurring.setTenant(tenant);
        } else if (!recurring.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
        if (!recurring.getEndTime().isAfter(recurring.getStartTime())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La hora de fin debe ser posterior a la de inicio");
        }
        CourtRecurringBooking saved = recurringRepository.save(recurring);
        if (saved.isActive()) {
            materialize(saved);
        } else {
            cancelFutureInstances(saved);
        }
        return saved;
    }

    /** Baja de la plantilla: cancela las instancias futuras vivas y borra el turno fijo. */
    @Transactional
    public void deleteAndVerifyOwnership(UUID id) {
        CourtRecurringBooking r = findByIdAndVerifyOwnership(id);
        cancelFutureInstances(r);
        recurringRepository.delete(r);
    }

    /** Job diario (sin contexto de tenant): mantiene materializado el horizonte de TODOS. */
    @Transactional
    public int materializeAllActive() {
        int created = 0;
        for (CourtRecurringBooking r : recurringRepository.findByActiveTrue()) {
            created += materialize(r);
        }
        return created;
    }

    /**
     * Crea las instancias que falten dentro del horizonte. Idempotente: si la fecha ya
     * fue materializada o el slot está ocupado por otra reserva, la saltea.
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public int materialize(CourtRecurringBooking r) {
        UUID tenantId = r.getTenant().getId();
        LocalDate today = LocalDate.now();
        LocalDate from = r.getValidFrom() != null && r.getValidFrom().isAfter(today) ? r.getValidFrom() : today;
        LocalDate to = today.plusDays(HORIZON_DAYS);
        if (r.getValidUntil() != null && r.getValidUntil().isBefore(to)) {
            to = r.getValidUntil();
        }

        int created = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            if (date.getDayOfWeek().getValue() != r.getDayOfWeek()) continue;

            LocalDateTime startAt = date.atTime(r.getStartTime());
            if (startAt.isBefore(LocalDateTime.now())) continue; // no materializar el pasado
            if (bookingRepository.existsByRecurringIdAndStartAt(r.getId(), startAt)) continue;
            if (bookingRepository.existsOverlapping(r.getCourt().getId(), startAt,
                    date.atTime(r.getEndTime()))) {
                log.info("Turno fijo {}: slot {} {} ocupado por otra reserva, se saltea.",
                        r.getId(), r.getCourt().getName(), startAt);
                continue;
            }

            CourtBooking b = new CourtBooking();
            b.setTenant(r.getTenant());
            b.setCourt(r.getCourt());
            b.setCustomer(r.getCustomer());
            b.setStartAt(startAt);
            b.setEndAt(date.atTime(r.getEndTime()));
            b.setStatus(CourtBookingStatus.CONFIRMED);
            b.setRecurring(r);
            b.setTotalPrice(r.getAgreedPrice() != null
                    ? r.getAgreedPrice()
                    : priceRuleService.resolvePrice(tenantId, r.getCourt().getId(), startAt,
                            settingsService.getOrCreateForTenant(tenantId).getDefaultPrice()));
            try {
                bookingRepository.saveAndFlush(b);
                created++;
            } catch (DataIntegrityViolationException e) {
                // Race con una reserva manual por el mismo slot: gana el otro, se saltea.
                log.info("Turno fijo {}: slot {} perdido por race, se saltea.", r.getId(), startAt);
            }
        }
        return created;
    }

    private void cancelFutureInstances(CourtRecurringBooking r) {
        List<CourtBooking> future = bookingRepository.findFutureAliveByRecurringId(r.getId(), LocalDateTime.now());
        for (CourtBooking b : future) {
            b.setStatus(CourtBookingStatus.CANCELLED);
        }
        bookingRepository.saveAll(future);
        if (!future.isEmpty()) {
            log.info("Turno fijo {}: {} instancias futuras canceladas.", r.getId(), future.size());
        }
    }
}
