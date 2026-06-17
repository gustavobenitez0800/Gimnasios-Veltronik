package com.veltronik.v2.courts.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.veltronik.v2.courts.dto.CourtBookingInputDTO;
import com.veltronik.v2.courts.entities.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * Las "manos" del bot: las funciones que Gemini puede invocar (function calling) sobre la
 * API de canchas que ya existe. Alcance v1: <b>informar + reservar</b> (deja el turno
 * esperando seña; la seña se pide por alias). Cada función:
 *  - se declara para Gemini en {@link #declarations()},
 *  - se ejecuta en {@link #execute} dentro del contexto de tenant que setea el orquestador.
 *
 * <p>{@code request_human} se declara acá pero lo intercepta {@link CourtBotService}
 * (dispara el handoff), no se ejecuta como las demás.</p>
 */
@Component
@Slf4j
public class CourtBotTools {

    private final ObjectMapper mapper = new ObjectMapper();

    private final CourtService courtService;
    private final CourtBookingService bookingService;
    private final CourtSettingsService settingsService;
    private final CourtPriceRuleService priceRuleService;
    private final CourtCustomerService customerService;

    public CourtBotTools(CourtService courtService,
                         CourtBookingService bookingService,
                         CourtSettingsService settingsService,
                         CourtPriceRuleService priceRuleService,
                         CourtCustomerService customerService) {
        this.courtService = courtService;
        this.bookingService = bookingService;
        this.settingsService = settingsService;
        this.priceRuleService = priceRuleService;
        this.customerService = customerService;
    }

    /** Contexto de la llamada: a qué tenant y a qué cliente (por su WhatsApp). */
    public record BotContext(String customerWaPhone) {}

    /** Nombres de funciones (para que el orquestador detecte el handoff). */
    public static final String FN_REQUEST_HUMAN = "request_human";

    // ─────────────────────────── declaraciones (schema para Gemini) ───────────────────────────

    public ArrayNode declarations() {
        ArrayNode tools = mapper.createArrayNode();
        ArrayNode fns = tools.addObject().putArray("functionDeclarations");

        // get_availability(date)
        {
            ObjectNode fn = fns.addObject();
            fn.put("name", "get_availability");
            fn.put("description", "Devuelve los horarios LIBRES de cada cancha para una fecha. "
                    + "Usala siempre antes de ofrecer o reservar un turno.");
            ObjectNode p = fn.putObject("parameters");
            p.put("type", "object");
            ObjectNode props = p.putObject("properties");
            props.putObject("date").put("type", "string")
                    .put("description", "Fecha en formato YYYY-MM-DD");
            p.putArray("required").add("date");
        }
        // get_prices()
        {
            ObjectNode fn = fns.addObject();
            fn.put("name", "get_prices");
            fn.put("description", "Devuelve el precio del turno por franja horaria y el precio base.");
            ObjectNode p = fn.putObject("parameters");
            p.put("type", "object");
            p.putObject("properties");
        }
        // create_hold(courtId, date, startTime, durationMinutes?, customerName?)
        {
            ObjectNode fn = fns.addObject();
            fn.put("name", "create_hold");
            fn.put("description", "Reserva un turno dejándolo ESPERANDO SEÑA (se libera solo si no pagan a tiempo). "
                    + "Usá un courtId que haya devuelto get_availability. Si el cliente es nuevo, pedile el nombre antes.");
            ObjectNode p = fn.putObject("parameters");
            p.put("type", "object");
            ObjectNode props = p.putObject("properties");
            props.putObject("courtId").put("type", "string").put("description", "id de la cancha (de get_availability)");
            props.putObject("date").put("type", "string").put("description", "Fecha YYYY-MM-DD");
            props.putObject("startTime").put("type", "string").put("description", "Hora de inicio HH:mm (24h)");
            props.putObject("durationMinutes").put("type", "integer").put("description", "Duración en minutos (default 60)");
            props.putObject("customerName").put("type", "string").put("description", "Nombre del cliente (si es nuevo)");
            p.putArray("required").add("courtId").add("date").add("startTime");
        }
        // request_human(reason)
        {
            ObjectNode fn = fns.addObject();
            fn.put("name", FN_REQUEST_HUMAN);
            fn.put("description", "Derivá a una persona del complejo cuando no puedas resolver el pedido, "
                    + "el cliente pida hablar con alguien, o sea un reclamo/tema sensible.");
            ObjectNode p = fn.putObject("parameters");
            p.put("type", "object");
            p.putObject("properties").putObject("reason").put("type", "string")
                    .put("description", "Motivo breve del pase a una persona");
            p.putArray("required").add("reason");
        }
        return tools;
    }

    // ─────────────────────────── ejecución ───────────────────────────

    /** Ejecuta una función y devuelve el payload de respuesta para el functionResponse. */
    public ObjectNode execute(String name, JsonNode args, BotContext ctx) {
        try {
            return switch (name) {
                case "get_availability" -> getAvailability(args);
                case "get_prices" -> getPrices();
                case "create_hold" -> createHold(args, ctx);
                default -> error("Función desconocida: " + name);
            };
        } catch (ResponseStatusException e) {
            return error(e.getReason() != null ? e.getReason() : "No se pudo completar la acción");
        } catch (Exception e) {
            log.error("Error ejecutando tool {}: {}", name, e.getMessage());
            return error("Error interno al ejecutar " + name);
        }
    }

    private ObjectNode getAvailability(JsonNode args) {
        LocalDate date = parseDate(text(args, "date"));
        if (date == null) return error("Fecha inválida");

        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();
        List<Court> courts = courtService.findActiveForCurrentTenant();
        List<CourtBooking> bookings = bookingService.findByDateForCurrentTenant(date);
        List<int[]> slots = buildSlots(settings); // [startMin, endMin]

        boolean today = date.isEqual(LocalDate.now());
        int nowMin = LocalTime.now().getHour() * 60 + LocalTime.now().getMinute();

        ObjectNode out = mapper.createObjectNode();
        out.put("date", date.toString());
        ArrayNode courtsArr = out.putArray("courts");
        for (Court c : courts) {
            ArrayNode free = mapper.createArrayNode();
            for (int[] slot : slots) {
                if (today && slot[0] <= nowMin) continue; // no ofrecer horarios ya pasados
                boolean taken = bookings.stream().anyMatch(b ->
                        b.getCourt().getId().equals(c.getId())
                                && isAlive(b.getStatus())
                                && overlaps(b, date, slot[0], slot[1]));
                if (!taken) free.add(hhmm(slot[0]));
            }
            ObjectNode co = courtsArr.addObject();
            co.put("courtId", c.getId().toString());
            co.put("court", c.getName());
            co.set("freeSlots", free);
        }
        return out;
    }

    private ObjectNode getPrices() {
        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();
        ObjectNode out = mapper.createObjectNode();
        if (settings.getDefaultPrice() != null) out.put("defaultPrice", settings.getDefaultPrice());
        ArrayNode rules = out.putArray("rules");
        for (CourtPriceRule r : priceRuleService.findAllForCurrentTenant()) {
            ObjectNode ro = rules.addObject();
            ro.put("court", r.getCourt() != null ? r.getCourt().getName() : "Todas");
            ro.put("day", r.getDayOfWeek() != null ? dayName(r.getDayOfWeek()) : "Todos");
            ro.put("from", r.getTimeFrom().toString());
            ro.put("to", r.getTimeTo().toString());
            ro.put("price", r.getPrice());
        }
        return out;
    }

    private ObjectNode createHold(JsonNode args, BotContext ctx) {
        String courtId = text(args, "courtId");
        LocalDate date = parseDate(text(args, "date"));
        LocalTime start = parseTime(text(args, "startTime"));
        if (courtId == null || date == null || start == null) return error("Faltan datos del turno (cancha, fecha u hora)");

        Court court;
        try {
            court = courtService.findByIdAndVerifyOwnership(java.util.UUID.fromString(courtId));
        } catch (Exception e) {
            return error("Cancha inválida");
        }

        // Cliente nuevo sin nombre → pedir el nombre antes de reservar.
        String name = text(args, "customerName");
        boolean known = customerService.findByPhoneForCurrentTenant(ctx.customerWaPhone()).isPresent();
        if (!known && (name == null || name.isBlank())) {
            ObjectNode out = mapper.createObjectNode();
            out.put("ok", false);
            out.put("need", "customerName");
            out.put("message", "Es un cliente nuevo: pedile el nombre antes de reservar.");
            return out;
        }

        CourtSettings settings = settingsService.getOrCreateForCurrentTenant();
        int duration = args.hasNonNull("durationMinutes") && args.get("durationMinutes").asInt() > 0
                ? args.get("durationMinutes").asInt() : settings.getSlotDurationMinutes();

        CourtBookingInputDTO in = new CourtBookingInputDTO();
        in.setCourtId(court.getId());
        in.setStartAt(LocalDateTime.of(date, start));
        in.setEndAt(LocalDateTime.of(date, start).plusMinutes(duration));
        in.setStatus("PENDING_DEPOSIT");
        in.setCustomerName(name);
        in.setCustomerPhone(ctx.customerWaPhone());

        final CourtBooking booking;
        try {
            booking = bookingService.create(in);
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 409) {
                ObjectNode out = mapper.createObjectNode();
                out.put("ok", false);
                out.put("error", "slot_taken");
                out.put("message", "Ese horario se acaba de ocupar. Ofrecé otro de get_availability.");
                return out;
            }
            return error(e.getReason() != null ? e.getReason() : "No se pudo reservar");
        }

        ObjectNode out = mapper.createObjectNode();
        out.put("ok", true);
        out.put("bookingId", booking.getId().toString());
        out.put("court", court.getName());
        out.put("date", date.toString());
        out.put("startTime", hhmm(start.getHour() * 60 + start.getMinute()));
        out.put("durationMinutes", duration);
        if (booking.getDepositAmount() != null) out.put("depositAmount", booking.getDepositAmount());
        if (settings.getPaymentAlias() != null) out.put("alias", settings.getPaymentAlias());
        out.put("expiresInMinutes", settings.getDepositTimeoutMinutes());
        out.put("message", "Turno reservado esperando seña. Pedile que transfiera la seña al alias "
                + "y avisale que el turno se libera solo si no paga a tiempo.");
        return out;
    }

    // ─────────────────────────── helpers ───────────────────────────

    private static boolean isAlive(CourtBookingStatus s) {
        return s != CourtBookingStatus.CANCELLED && s != CourtBookingStatus.EXPIRED;
    }

    /** ¿El turno se solapa con [slotStart, slotEnd) (minutos del día de {@code date})? */
    private static boolean overlaps(CourtBooking b, LocalDate date, int slotStart, int slotEnd) {
        int s = b.getStartAt().toLocalDate().isBefore(date) ? 0
                : b.getStartAt().getHour() * 60 + b.getStartAt().getMinute();
        int e = b.getEndAt().toLocalDate().isAfter(date) ? 24 * 60
                : b.getEndAt().getHour() * 60 + b.getEndAt().getMinute();
        return s < slotEnd && e > slotStart;
    }

    /** Slots [startMin, endMin] según la config del tenant (igual que la grilla). */
    private static List<int[]> buildSlots(CourtSettings settings) {
        int slot = settings.getSlotDurationMinutes() > 0 ? settings.getSlotDurationMinutes() : 60;
        int open = settings.getOpeningTime().getHour() * 60 + settings.getOpeningTime().getMinute();
        int close = settings.getClosingTime().getHour() * 60 + settings.getClosingTime().getMinute();
        if (close <= open) close = 24 * 60 - 1;
        List<int[]> out = new java.util.ArrayList<>();
        for (int t = open; t + slot <= close + 1; t += slot) {
            out.add(new int[]{t, Math.min(t + slot, 24 * 60 - 1)});
        }
        return out;
    }

    private static String hhmm(int mins) {
        return String.format("%02d:%02d", mins / 60, mins % 60);
    }

    private static LocalDate parseDate(String s) {
        try { return s == null ? null : LocalDate.parse(s.trim()); }
        catch (Exception e) { return null; }
    }

    private static LocalTime parseTime(String s) {
        if (s == null) return null;
        String t = s.trim();
        try {
            if (t.matches("\\d{1,2}")) return LocalTime.of(Integer.parseInt(t), 0);
            return LocalTime.parse(t.length() == 4 ? "0" + t : t); // "9:00" → "09:00"
        } catch (Exception e) { return null; }
    }

    private static final String[] DAYS = {"", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};
    private static String dayName(int iso) {
        return (iso >= 1 && iso <= 7) ? DAYS[iso] : String.valueOf(iso);
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.get(field);
        return (n == null || n.isNull()) ? null : n.asText();
    }

    private ObjectNode error(String message) {
        ObjectNode out = mapper.createObjectNode();
        out.put("ok", false);
        out.put("error", message);
        return out;
    }
}
