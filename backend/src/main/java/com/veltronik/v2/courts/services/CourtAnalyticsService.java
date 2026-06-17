package com.veltronik.v2.courts.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.courts.dto.CourtDashboardDTO;
import com.veltronik.v2.courts.dto.CourtDashboardDTO.*;
import com.veltronik.v2.courts.dto.CourtReportDTO;
import com.veltronik.v2.courts.dto.CourtReportDTO.IncomeRow;
import com.veltronik.v2.courts.dto.CourtReportDTO.NoShowRow;
import com.veltronik.v2.courts.entities.*;
import com.veltronik.v2.courts.repositories.CourtBookingRepository;
import com.veltronik.v2.courts.repositories.CourtConversationRepository;
import com.veltronik.v2.courts.repositories.CourtRecurringBookingRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Analítica del vertical canchas (dashboard + reportes). Lecturas agregadas pensadas para
 * el dueño: ocupación (la métrica reina), no-shows (el enemigo), ingresos por método y la
 * capa Veltronik AI (predicción + insights). Carga los datos en pocas queries y agrega en
 * memoria (latencia DB ~120ms/query), igual que el resto del módulo.
 */
@Service
public class CourtAnalyticsService {

    private static final String[] DAY_NAMES = {"", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};
    private static final List<CourtBookingStatus> USED = List.of(
            CourtBookingStatus.PENDING_DEPOSIT, CourtBookingStatus.CONFIRMED,
            CourtBookingStatus.COMPLETED, CourtBookingStatus.NO_SHOW);

    private final CourtBookingRepository bookingRepository;
    private final CourtSettingsService settingsService;
    private final CourtService courtService;
    private final CourtRecurringBookingRepository recurringRepository;
    private final CourtConversationRepository conversationRepository;

    public CourtAnalyticsService(CourtBookingRepository bookingRepository,
                                 CourtSettingsService settingsService,
                                 CourtService courtService,
                                 CourtRecurringBookingRepository recurringRepository,
                                 CourtConversationRepository conversationRepository) {
        this.bookingRepository = bookingRepository;
        this.settingsService = settingsService;
        this.courtService = courtService;
        this.recurringRepository = recurringRepository;
        this.conversationRepository = conversationRepository;
    }

    /** Un evento de cobro (seña o saldo) atribuido a una fecha/método/cancha/cliente. */
    private record PayEvent(LocalDate date, CourtPaymentMethod method, BigDecimal amount,
                            Court court, CourtCustomer customer, boolean recurring, String concept) {}

    // ───────────────────────────────── DASHBOARD ─────────────────────────────────

    public CourtDashboardDTO dashboard() {
        UUID tenant = TenantContextHolder.getTenantId();
        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();
        List<Court> courts = courtService.findActiveForCurrentTenant();

        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDateTime monthFrom = monthStart.atStartOfDay();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime tomorrow = today.plusDays(1).atStartOfDay();
        LocalDate occFrom = today.minusDays(27);

        List<CourtBooking> startSet = bookingRepository.findByStartWithCourt(tenant, occFrom.atStartOfDay(), tomorrow);
        List<CourtBooking> paid = bookingRepository.findPaidWithRelations(tenant, monthFrom, now);
        List<PayEvent> events = extractEvents(paid, monthStart, today);

        CourtDashboardDTO dto = new CourtDashboardDTO();
        dto.setPeriod(monthStart.toString().substring(0, 7));

        // ── plata ──
        BigDecimal monthRevenue = BigDecimal.ZERO, cash = BigDecimal.ZERO, transfer = BigDecimal.ZERO, mp = BigDecimal.ZERO, today$ = BigDecimal.ZERO, recurring$ = BigDecimal.ZERO;
        for (PayEvent e : events) {
            monthRevenue = monthRevenue.add(e.amount());
            switch (e.method() == null ? CourtPaymentMethod.CASH : e.method()) {
                case CASH -> cash = cash.add(e.amount());
                case TRANSFER -> transfer = transfer.add(e.amount());
                case MP -> mp = mp.add(e.amount());
            }
            if (e.date().isEqual(today)) today$ = today$.add(e.amount());
            if (e.recurring()) recurring$ = recurring$.add(e.amount());
        }
        dto.setMonthRevenue(monthRevenue);
        dto.setTodayRevenue(today$);
        dto.setCollectedCash(cash);
        dto.setCollectedTransfer(transfer);
        dto.setCollectedMp(mp);
        dto.setRecurringRevenuePct(pct(recurring$, monthRevenue));

        // ── ingresos por día (últimos 14) ──
        Map<LocalDate, BigDecimal> byDate = new HashMap<>();
        for (PayEvent e : events) byDate.merge(e.date(), e.amount(), BigDecimal::add);
        List<DayPoint> revenueByDay = new ArrayList<>();
        for (int i = 13; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            revenueByDay.add(new DayPoint(d.toString(), byDate.getOrDefault(d, BigDecimal.ZERO)));
        }
        dto.setRevenueByDay(revenueByDay);

        // ── ocupación, completados, no-shows (del mes) ──
        List<CourtBooking> monthStartSet = startSet.stream()
                .filter(b -> !b.getStartAt().toLocalDate().isBefore(monthStart)).toList();
        int completed = 0, noShow = 0;
        for (CourtBooking b : monthStartSet) {
            if (b.getStatus() == CourtBookingStatus.COMPLETED) completed++;
            else if (b.getStatus() == CourtBookingStatus.NO_SHOW) noShow++;
        }
        dto.setCompletedCount(completed);
        dto.setNoShowCount(noShow);
        dto.setNoShowRatePct(pct(BigDecimal.valueOf(noShow), BigDecimal.valueOf(completed + noShow)));
        dto.setOccupancyPct(occupancy(monthStartSet, courts.size(), settings, monthStart, today));

        // ── por cancha ──
        Map<UUID, BigDecimal> revByCourt = new HashMap<>();
        for (PayEvent e : events) if (e.court() != null) revByCourt.merge(e.court().getId(), e.amount(), BigDecimal::add);
        List<CourtStat> byCourt = new ArrayList<>();
        for (Court c : courts) {
            List<CourtBooking> cb = monthStartSet.stream().filter(b -> b.getCourt().getId().equals(c.getId())).toList();
            int occ = occupancy(cb, 1, settings, monthStart, today);
            byCourt.add(new CourtStat(c.getName(), occ, revByCourt.getOrDefault(c.getId(), BigDecimal.ZERO)));
        }
        dto.setByCourt(byCourt);

        // ── heatmap (28 días) ──
        dto.setHeatmap(heatmap(startSet, courts.size(), settings, occFrom, today));

        // ── señas pendientes ──
        List<CourtBooking> pending = bookingRepository.findByStatus(CourtBookingStatus.PENDING_DEPOSIT);
        BigDecimal pendingAmt = BigDecimal.ZERO;
        for (CourtBooking b : pending) if (b.getDepositAmount() != null) pendingAmt = pendingAmt.add(b.getDepositAmount());
        dto.setPendingDepositCount(pending.size());
        dto.setPendingDepositAmount(pendingAmt);

        // ── turnos fijos ──
        int activeRecurring = (int) recurringRepository.countByTenantIdAndActiveTrue(tenant);
        dto.setActiveRecurringCount(activeRecurring);

        // ── predicción ──
        dto.setPrediction(predict(tenant, monthRevenue, today));

        // ── top clientes ──
        dto.setTopCustomers(topCustomers(events));

        // ── bot ──
        dto.setBotConversations(conversationRepository.countByTenantId(tenant));
        dto.setBotHandoffs(conversationRepository.countByTenantIdAndStatus(tenant, CourtConversationStatus.HUMAN_HANDOFF));

        // ── insights ──
        dto.setInsights(insights(dto));
        return dto;
    }

    // ───────────────────────────────── REPORTE ─────────────────────────────────

    public CourtReportDTO report(LocalDate from, LocalDate to) {
        UUID tenant = TenantContextHolder.getTenantId();
        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();
        int courtsCount = courtService.findActiveForCurrentTenant().size();

        LocalDateTime f = from.atStartOfDay();
        LocalDateTime t = to.plusDays(1).atStartOfDay();
        List<CourtBooking> paid = bookingRepository.findPaidWithRelations(tenant, f, t);
        List<CourtBooking> startSet = bookingRepository.findByStartWithCourt(tenant, f, t);
        List<PayEvent> events = extractEvents(paid, from, to);

        CourtReportDTO dto = new CourtReportDTO();
        dto.setFrom(from.toString());
        dto.setTo(to.toString());

        List<IncomeRow> income = new ArrayList<>();
        BigDecimal cash = BigDecimal.ZERO, transfer = BigDecimal.ZERO, mp = BigDecimal.ZERO, total = BigDecimal.ZERO;
        events.sort(Comparator.comparing(PayEvent::date));
        for (PayEvent e : events) {
            income.add(new IncomeRow(e.date().toString(),
                    e.court() != null ? e.court().getName() : "—",
                    e.customer() != null ? e.customer().getFullName() : "—",
                    e.concept(), methodLabel(e.method()), e.amount()));
            total = total.add(e.amount());
            switch (e.method() == null ? CourtPaymentMethod.CASH : e.method()) {
                case CASH -> cash = cash.add(e.amount());
                case TRANSFER -> transfer = transfer.add(e.amount());
                case MP -> mp = mp.add(e.amount());
            }
        }
        dto.setIncome(income);
        dto.setTotalCash(cash);
        dto.setTotalTransfer(transfer);
        dto.setTotalMp(mp);
        dto.setTotal(total);

        List<NoShowRow> noShows = new ArrayList<>();
        int completed = 0, noShow = 0, used = 0;
        for (CourtBooking b : startSet) {
            if (USED.contains(b.getStatus())) used++;
            if (b.getStatus() == CourtBookingStatus.COMPLETED) completed++;
            if (b.getStatus() == CourtBookingStatus.NO_SHOW) {
                noShow++;
                noShows.add(new NoShowRow(b.getStartAt().toLocalDate().toString(),
                        b.getCourt().getName(),
                        b.getCustomer() != null ? b.getCustomer().getFullName() : "—",
                        b.getCustomer() != null ? b.getCustomer().getPhone() : ""));
            }
        }
        dto.setNoShows(noShows);
        dto.setTotalBookings(used);
        dto.setCompletedCount(completed);
        dto.setNoShowCount(noShow);
        dto.setOccupancyPct(occupancy(startSet, courtsCount, settings, from, to));
        return dto;
    }

    // ───────────────────────────────── helpers ─────────────────────────────────

    private List<PayEvent> extractEvents(List<CourtBooking> paid, LocalDate from, LocalDate to) {
        List<PayEvent> events = new ArrayList<>();
        for (CourtBooking b : paid) {
            boolean rec = b.getRecurring() != null;
            if (b.getDepositPaidAt() != null && b.getDepositAmount() != null
                    && inRange(b.getDepositPaidAt().toLocalDate(), from, to)) {
                events.add(new PayEvent(b.getDepositPaidAt().toLocalDate(), b.getDepositMethod(),
                        b.getDepositAmount(), b.getCourt(), b.getCustomer(), rec, "Seña"));
            }
            if (b.getPaidAt() != null && b.getAmountPaid() != null
                    && inRange(b.getPaidAt().toLocalDate(), from, to)) {
                events.add(new PayEvent(b.getPaidAt().toLocalDate(), b.getPaymentMethod(),
                        b.getAmountPaid(), b.getCourt(), b.getCustomer(), rec, "Saldo"));
            }
        }
        return events;
    }

    private static boolean inRange(LocalDate d, LocalDate from, LocalDate to) {
        return !d.isBefore(from) && !d.isAfter(to);
    }

    /** Ocupación % = minutos jugados / capacidad horaria de las canchas en el rango. */
    private int occupancy(List<CourtBooking> bookings, int courtsCount, CourtSettings settings,
                          LocalDate from, LocalDate to) {
        if (courtsCount <= 0) return 0;
        int open = minute(settings.getOpeningTime());
        int close = minute(settings.getClosingTime());
        if (close <= open) close = 24 * 60;
        long days = to.toEpochDay() - from.toEpochDay() + 1;
        long capacity = (long) courtsCount * (close - open) * Math.max(1, days);
        long occupied = 0;
        for (CourtBooking b : bookings) {
            if (b.getStatus() == CourtBookingStatus.MAINTENANCE
                    || b.getStatus() == CourtBookingStatus.CANCELLED
                    || b.getStatus() == CourtBookingStatus.EXPIRED) continue;
            occupied += overlapMinutes(b, open, close);
        }
        return capacity > 0 ? (int) Math.min(100, Math.round(occupied * 100.0 / capacity)) : 0;
    }

    private static long overlapMinutes(CourtBooking b, int open, int close) {
        int s = b.getStartAt().getHour() * 60 + b.getStartAt().getMinute();
        int e = b.getEndAt().toLocalDate().isAfter(b.getStartAt().toLocalDate())
                ? 24 * 60 : b.getEndAt().getHour() * 60 + b.getEndAt().getMinute();
        return Math.max(0, Math.min(close, e) - Math.max(open, s));
    }

    private List<HeatCell> heatmap(List<CourtBooking> startSet, int courtsCount, CourtSettings settings,
                                   LocalDate from, LocalDate to) {
        int openHour = settings.getOpeningTime().getHour();
        int closeHour = settings.getClosingTime().getHour();
        if (closeHour <= openHour) closeHour = 24;

        // Cuántas fechas de cada día de semana hay en la ventana (para el denominador).
        int[] dowDays = new int[8];
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) dowDays[d.getDayOfWeek().getValue()]++;

        // Court-horas ocupadas por (dow, hora).
        Map<Integer, Integer> occupied = new HashMap<>(); // key = dow*100 + hour
        for (CourtBooking b : startSet) {
            if (b.getStatus() == CourtBookingStatus.MAINTENANCE
                    || b.getStatus() == CourtBookingStatus.CANCELLED
                    || b.getStatus() == CourtBookingStatus.EXPIRED) continue;
            int dow = b.getStartAt().getDayOfWeek().getValue();
            int sH = b.getStartAt().getHour();
            int eH = b.getEndAt().getMinute() > 0 ? b.getEndAt().getHour() + 1 : b.getEndAt().getHour();
            if (b.getEndAt().toLocalDate().isAfter(b.getStartAt().toLocalDate())) eH = 24;
            for (int h = Math.max(openHour, sH); h < Math.min(closeHour, eH); h++) {
                occupied.merge(dow * 100 + h, 1, Integer::sum);
            }
        }

        List<HeatCell> cells = new ArrayList<>();
        for (int dow = 1; dow <= 7; dow++) {
            int denom = courtsCount * Math.max(1, dowDays[dow]);
            for (int h = openHour; h < closeHour; h++) {
                int occ = occupied.getOrDefault(dow * 100 + h, 0);
                cells.add(new HeatCell(dow, h, denom > 0 ? Math.min(100, occ * 100 / denom) : 0));
            }
        }
        return cells;
    }

    private Prediction predict(UUID tenant, BigDecimal monthRevenue, LocalDate today) {
        LocalDate lastMonthStart = today.withDayOfMonth(1).minusMonths(1);
        LocalDate lastMonthEnd = today.withDayOfMonth(1).minusDays(1);
        BigDecimal lastMonth = sumAll(bookingRepository.sumDepositsByMethod(tenant,
                        lastMonthStart.atStartOfDay(), lastMonthEnd.plusDays(1).atStartOfDay()))
                .add(sumAll(bookingRepository.sumBalancesByMethod(tenant,
                        lastMonthStart.atStartOfDay(), lastMonthEnd.plusDays(1).atStartOfDay())));

        int daysElapsed = today.getDayOfMonth();
        int daysInMonth = today.lengthOfMonth();
        BigDecimal projected = daysElapsed > 0
                ? monthRevenue.multiply(BigDecimal.valueOf(daysInMonth))
                    .divide(BigDecimal.valueOf(daysElapsed), 0, RoundingMode.HALF_UP)
                : monthRevenue;

        double change = lastMonth.signum() > 0
                ? projected.subtract(lastMonth).doubleValue() * 100.0 / lastMonth.doubleValue() : 0.0;
        String trend = change > 2 ? "up" : change < -2 ? "down" : "flat";
        int confidence = Math.min(90, 40 + daysElapsed * 2);
        return new Prediction(projected, confidence, trend, Math.round(change * 10.0) / 10.0);
    }

    private List<CustomerStat> topCustomers(List<PayEvent> events) {
        Map<UUID, BigDecimal> spent = new HashMap<>();
        Map<UUID, Set<String>> visits = new HashMap<>();
        Map<UUID, CourtCustomer> ref = new HashMap<>();
        for (PayEvent e : events) {
            if (e.customer() == null) continue;
            UUID id = e.customer().getId();
            ref.putIfAbsent(id, e.customer());
            spent.merge(id, e.amount(), BigDecimal::add);
            visits.computeIfAbsent(id, k -> new HashSet<>()).add(e.date() + "|" + e.concept());
        }
        return spent.entrySet().stream()
                .sorted(Map.Entry.<UUID, BigDecimal>comparingByValue().reversed())
                .limit(5)
                .map(en -> new CustomerStat(ref.get(en.getKey()).getFullName(),
                        ref.get(en.getKey()).getPhone(), en.getValue(),
                        visits.getOrDefault(en.getKey(), Set.of()).size()))
                .toList();
    }

    private List<Insight> insights(CourtDashboardDTO d) {
        List<Insight> out = new ArrayList<>();
        if (d.getNoShowRatePct() >= 15) {
            out.add(new Insight("warning", "Muchos no-shows",
                    "Tenés " + d.getNoShowRatePct() + "% de no-shows este mes. Pedí seña siempre para asegurar los turnos."));
        }
        if (d.getPendingDepositCount() > 0) {
            out.add(new Insight("info", "Señas sin cobrar",
                    "Hay " + d.getPendingDepositCount() + " turno(s) esperando seña por " + money(d.getPendingDepositAmount()) + "."));
        }
        // Día más flojo según el heatmap.
        int[] sum = new int[8], cnt = new int[8];
        for (HeatCell c : d.getHeatmap()) { sum[c.dayOfWeek()] += c.occupancyPct(); cnt[c.dayOfWeek()]++; }
        int worstDow = -1, worstAvg = 101;
        for (int dow = 1; dow <= 7; dow++) {
            if (cnt[dow] == 0) continue;
            int avg = sum[dow] / cnt[dow];
            if (avg < worstAvg) { worstAvg = avg; worstDow = dow; }
        }
        if (worstDow > 0 && worstAvg < 35) {
            out.add(new Insight("tip", "Día flojo",
                    "Los " + DAY_NAMES[worstDow] + " tenés baja ocupación (" + worstAvg + "%). Probá una promo o turnos fijos para llenarlo."));
        }
        if (d.getRecurringRevenuePct() >= 30) {
            out.add(new Insight("info", "Ingreso predecible",
                    "Los turnos fijos son el " + d.getRecurringRevenuePct() + "% de tu facturación. Cuidá esos clientes."));
        }
        if (!d.getTopCustomers().isEmpty()) {
            CustomerStat top = d.getTopCustomers().get(0);
            out.add(new Insight("success", "Mejor cliente",
                    top.name() + " es tu mejor cliente del mes (" + money(top.spent()) + ")."));
        }
        return out;
    }

    private static BigDecimal sumAll(List<Object[]> rows) {
        BigDecimal s = BigDecimal.ZERO;
        for (Object[] r : rows) if (r[1] != null) s = s.add((BigDecimal) r[1]);
        return s;
    }

    private static int minute(java.time.LocalTime t) {
        return t.getHour() * 60 + t.getMinute();
    }

    private static int pct(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0) return 0;
        return (int) Math.min(100, Math.round(part.doubleValue() * 100.0 / whole.doubleValue()));
    }

    private static String money(BigDecimal v) {
        return "$" + (v == null ? "0" : v.toBigInteger().toString());
    }

    private static String methodLabel(CourtPaymentMethod m) {
        if (m == null) return "Efectivo";
        return switch (m) {
            case CASH -> "Efectivo";
            case TRANSFER -> "Transferencia";
            case MP -> "Mercado Pago";
        };
    }
}
