package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.dto.*;
import com.veltronik.v2.courts.entities.*;
import com.veltronik.v2.courts.repositories.CourtBookingRepository;
import com.veltronik.v2.courts.repositories.CourtSettingsRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Reservas online (link público): el cliente final reserva solo, sin login, identificándose
 * por su teléfono. El complejo se resuelve por un token impredecible. Automatiza el mostrador.
 *
 * <p><b>Superficie pública = cuidado:</b> corre sin usuario autenticado, así que (1) resuelve
 * el tenant por token y setea el contexto a mano (como el bot/cron), (2) NUNCA expone datos
 * sensibles (clientes, finanzas), (3) tiene anti-abuso: rate-limit por token + tope de reservas
 * pendientes por teléfono. El índice único parcial sigue blindando la doble-reserva, y las
 * señas impagas expiran solas (cron) — el spam de holds se autolimpia.</p>
 */
@Service
@Slf4j
public class CourtPublicService {

    private static final int RL_MAX = 8;            // reservas por ventana...
    private static final long RL_WINDOW_MS = 60_000; // ...por minuto, por token
    private static final int MAX_PENDING_PER_PHONE = 3;
    private static final int MAX_SLOTS = 4;          // tope de duración (anti bloqueo de franjas)

    /** Rate-limit en memoria por token (timestamps de las últimas reservas). */
    private final Map<String, Deque<Long>> rateLog = new ConcurrentHashMap<>();

    private final CourtSettingsRepository settingsRepository;
    private final TenantRepository tenantRepository;
    private final CourtService courtService;
    private final CourtBookingService bookingService;
    private final CourtBookingRepository bookingRepository;

    public CourtPublicService(CourtSettingsRepository settingsRepository,
                              TenantRepository tenantRepository,
                              CourtService courtService,
                              CourtBookingService bookingService,
                              CourtBookingRepository bookingRepository) {
        this.settingsRepository = settingsRepository;
        this.tenantRepository = tenantRepository;
        this.courtService = courtService;
        this.bookingService = bookingService;
        this.bookingRepository = bookingRepository;
    }

    // ─────────────────────────── endpoints ───────────────────────────

    public CourtPublicVenueDTO venue(String token) {
        CourtSettings s = resolveOrThrow(token);
        return inTenant(s, () -> {
            CourtPublicVenueDTO dto = new CourtPublicVenueDTO();
            Tenant t = tenantRepository.findById(s.getTenant().getId()).orElse(null);
            dto.setName(t != null ? t.getName() : "Complejo");
            dto.setSlotDurationMinutes(s.getSlotDurationMinutes());
            dto.setOpeningTime(s.getOpeningTime());
            dto.setClosingTime(s.getClosingTime());
            dto.setDepositAmount(s.getDepositAmount());
            dto.setPaymentAlias(s.getPaymentAlias());
            dto.setWhatsappNumber(s.getWhatsappNumber());
            dto.setCourts(courtService.findActiveForCurrentTenant().stream()
                    .map(c -> new CourtPublicVenueDTO.CourtBrief(
                            c.getId().toString(), c.getName(), c.getSurface(), c.isCovered()))
                    .toList());
            return dto;
        });
    }

    public CourtPublicAvailabilityDTO availability(String token, LocalDate date) {
        CourtSettings s = resolveOrThrow(token);
        return inTenant(s, () -> {
            List<CourtBooking> bookings = bookingService.findByDateForCurrentTenant(date);
            List<int[]> slots = buildSlots(s);
            boolean today = date.isEqual(LocalDate.now());
            int nowMin = LocalTime.now().getHour() * 60 + LocalTime.now().getMinute();

            CourtPublicAvailabilityDTO dto = new CourtPublicAvailabilityDTO();
            dto.setDate(date.toString());
            List<CourtPublicAvailabilityDTO.CourtFree> out = new ArrayList<>();
            for (Court c : courtService.findActiveForCurrentTenant()) {
                List<String> free = new ArrayList<>();
                for (int[] slot : slots) {
                    if (today && slot[0] <= nowMin) continue;
                    boolean taken = bookings.stream().anyMatch(b ->
                            b.getCourt().getId().equals(c.getId())
                                    && b.getStatus() != CourtBookingStatus.CANCELLED
                                    && b.getStatus() != CourtBookingStatus.EXPIRED
                                    && overlaps(b, date, slot[0], slot[1]));
                    if (!taken) free.add(hhmm(slot[0]));
                }
                out.add(new CourtPublicAvailabilityDTO.CourtFree(c.getId().toString(), c.getName(), free));
            }
            dto.setCourts(out);
            return dto;
        });
    }

    public CourtPublicBookResultDTO book(String token, CourtPublicBookInputDTO in) {
        CourtSettings s = resolveOrThrow(token);
        if (!allow(token)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Demasiados intentos. Esperá un momento y probá de nuevo.");
        }
        return inTenant(s, () -> {
            LocalDate date = parseDate(in.getDate());
            LocalTime start = parseTime(in.getStartTime());
            if (date == null || start == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fecha u horario inválidos");
            }
            LocalDateTime startAt = LocalDateTime.of(date, start);
            if (startAt.isBefore(LocalDateTime.now())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ese horario ya pasó");
            }
            int slot = s.getSlotDurationMinutes() > 0 ? s.getSlotDurationMinutes() : 60;
            int duration = (in.getDurationMinutes() != null && in.getDurationMinutes() > 0)
                    ? Math.min(in.getDurationMinutes(), slot * MAX_SLOTS) : slot;

            // Tope de reservas pendientes por teléfono (anti-abuso).
            String phone = CourtCustomerService.normalizePhone(in.getCustomerPhone());
            long pending = bookingRepository.findByStatus(CourtBookingStatus.PENDING_DEPOSIT).stream()
                    .filter(b -> b.getCustomer() != null && phone != null && phone.equals(b.getCustomer().getPhone()))
                    .count();
            if (pending >= MAX_PENDING_PER_PHONE) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Ya tenés varias reservas esperando seña. Pagá esas primero.");
            }

            Court court = courtService.findByIdAndVerifyOwnership(in.getCourtId());

            CourtBookingInputDTO booking = new CourtBookingInputDTO();
            booking.setCourtId(court.getId());
            booking.setStartAt(startAt);
            booking.setEndAt(startAt.plusMinutes(duration));
            booking.setStatus("PENDING_DEPOSIT");
            booking.setCustomerName(in.getCustomerName());
            booking.setCustomerPhone(in.getCustomerPhone());

            final CourtBooking created;
            try {
                created = bookingService.create(booking);
            } catch (ResponseStatusException e) {
                if (e.getStatusCode().value() == 409) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Ese horario se acaba de ocupar. Elegí otro.");
                }
                throw e;
            }

            CourtPublicBookResultDTO res = new CourtPublicBookResultDTO();
            res.setBookingId(created.getId().toString());
            res.setCourt(court.getName());
            res.setDate(date.toString());
            res.setStartTime(hhmm(start.getHour() * 60 + start.getMinute()));
            res.setEndTime(hhmm(Math.min(start.getHour() * 60 + start.getMinute() + duration, 24 * 60 - 1)));
            res.setDepositAmount(created.getDepositAmount());
            res.setPaymentAlias(s.getPaymentAlias());
            res.setWhatsappNumber(s.getWhatsappNumber());
            res.setExpiresInMinutes(s.getDepositTimeoutMinutes());
            return res;
        });
    }

    // ─────────────────────────── helpers ───────────────────────────

    /** Resuelve el complejo por token (sin contexto de tenant: el índice es global). */
    private CourtSettings resolveOrThrow(String token) {
        CourtSettings s = settingsRepository.findByPublicToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Link de reservas no válido"));
        if (!s.isPublicBookingEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Las reservas online están desactivadas");
        }
        Tenant t = tenantRepository.findById(s.getTenant().getId()).orElse(null);
        if (t == null || !t.isActive()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Complejo no disponible");
        }
        return s;
    }

    /** Ejecuta con el contexto de tenant seteado (para que el filtro de Hibernate scope-e). */
    private <T> T inTenant(CourtSettings s, java.util.function.Supplier<T> body) {
        TenantContextHolder.setTenantId(s.getTenant().getId());
        try {
            return body.get();
        } finally {
            TenantContextHolder.clear();
        }
    }

    /** Rate-limit por token: máx {@value #RL_MAX} reservas por minuto. */
    private boolean allow(String token) {
        long now = System.currentTimeMillis();
        Deque<Long> log = rateLog.computeIfAbsent(token, k -> new ArrayDeque<>());
        synchronized (log) {
            while (!log.isEmpty() && now - log.peekFirst() > RL_WINDOW_MS) log.pollFirst();
            if (log.size() >= RL_MAX) return false;
            log.addLast(now);
            return true;
        }
    }

    private static boolean overlaps(CourtBooking b, LocalDate date, int slotStart, int slotEnd) {
        int s = b.getStartAt().toLocalDate().isBefore(date) ? 0
                : b.getStartAt().getHour() * 60 + b.getStartAt().getMinute();
        int e = b.getEndAt().toLocalDate().isAfter(date) ? 24 * 60
                : b.getEndAt().getHour() * 60 + b.getEndAt().getMinute();
        return s < slotEnd && e > slotStart;
    }

    private static List<int[]> buildSlots(CourtSettings settings) {
        int slot = settings.getSlotDurationMinutes() > 0 ? settings.getSlotDurationMinutes() : 60;
        int open = settings.getOpeningTime().getHour() * 60 + settings.getOpeningTime().getMinute();
        int close = settings.getClosingTime().getHour() * 60 + settings.getClosingTime().getMinute();
        if (close <= open) close = 24 * 60 - 1;
        List<int[]> out = new ArrayList<>();
        for (int t = open; t + slot <= close + 1; t += slot) {
            out.add(new int[]{t, Math.min(t + slot, 24 * 60 - 1)});
        }
        return out;
    }

    private static String hhmm(int mins) {
        return String.format("%02d:%02d", mins / 60, mins % 60);
    }

    private static LocalDate parseDate(String s) {
        try { return LocalDate.parse(s.trim()); } catch (Exception e) { return null; }
    }

    private static LocalTime parseTime(String s) {
        try {
            String t = s.trim();
            if (t.matches("\\d{1,2}")) return LocalTime.of(Integer.parseInt(t), 0);
            return LocalTime.parse(t.length() == 4 ? "0" + t : t);
        } catch (Exception e) { return null; }
    }
}
