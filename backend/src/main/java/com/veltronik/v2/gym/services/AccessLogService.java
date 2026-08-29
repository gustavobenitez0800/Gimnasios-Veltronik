package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.AccessLogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class AccessLogService {

    private final AccessLogRepository accessLogRepository;
    private final GymMemberService memberService;

    public AccessLogService(AccessLogRepository accessLogRepository, GymMemberService memberService) {
        this.accessLogRepository = accessLogRepository;
        this.memberService = memberService;
    }

    /** Zona del negocio (Argentina): "hoy" y los rangos se calculan en hora AR, no UTC. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    public List<AccessLog> getTodayAccesses() {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        LocalDateTime startOfDay = today.atStartOfDay();
        LocalDateTime endOfDay = today.atTime(LocalTime.MAX);
        return accessLogRepository.findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), startOfDay, endOfDay);
    }

    /**
     * Accesos del tenant en un rango de fechas [start, end] (día calendario AR).
     * start → 00:00:00, end → 23:59:59 (fin de día inclusivo). Usado por Reportes.
     */
    public List<AccessLog> getAccessesByDateRange(LocalDate start, LocalDate end) {
        LocalDateTime from = start.atStartOfDay();
        LocalDateTime to = end.atTime(LocalTime.MAX);
        return accessLogRepository.findByTenantIdAndCheckInAtBetweenOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), from, to);
    }

    public List<AccessLog> getActiveAccesses() {
        return accessLogRepository.findByTenantIdAndCheckOutAtIsNullOrderByCheckInAtDesc(TenantContextHolder.getTenantId());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Marcar entrada / salida
    // ─────────────────────────────────────────────────────────────────────────

    /** Qué terminó siendo el escaneo. */
    public enum Direction { ENTRADA, SALIDA, REBOTE }

    /**
     * @param log        el registro afectado
     * @param direction  qué se hizo
     * @param recuperado true si hubo que cerrar una visita que el socio nunca cerró
     */
    public record ScanResult(AccessLog log, Direction direction, boolean recuperado) {}

    /**
     * Un segundo escaneo dentro de esta ventana es el mismo gesto, no un cambio de opinión:
     * el dedo tembló, o el teléfono leyó el QR dos veces. Sin esto, el socio que escanea con
     * ganas entra y sale en el mismo segundo.
     */
    private static final long REBOTE_SEGUNDOS = 15;

    /**
     * Pasadas estas horas, una visita abierta ya no es alguien adentro: es alguien que se fue
     * sin marcar. Nadie entrena seis horas.
     */
    private static final long VISITA_MAXIMA_HORAS = 6;

    /**
     * Marca el paso de un socio, deduciendo si es entrada o salida.
     *
     * <p><b>Por qué NO es un interruptor.</b> Antes esto hacía "si hay visita abierta la cierro,
     * si no abro una". Con un recepcionista mirando la pantalla funcionaba; automatizado se
     * rompe solo y no se recupera nunca:</p>
     *
     * <pre>
     *   lunes    entra y marca      → visita abierta
     *   lunes    se va sin marcar   → queda "adentro"
     *   martes   llega y marca      → se lee como SALIDA del lunes.
     *                                 Su entrada del martes NO EXISTE.
     *   martes   se va y marca      → abre una visita nueva → "adentro" toda la noche
     * </pre>
     *
     * <p>A partir del primer olvido, todas las visitas quedan invertidas, para siempre. Y no
     * rompe solo el "cuánta gente hay": rompe <i>"¿vino este socio este mes?"</i>, que es el
     * número con el que el dueño decide a quién llamar.</p>
     *
     * <p><b>La regla nueva: la dirección la decide el tiempo.</b> Un escaneo es ENTRADA salvo que
     * haya una visita abierta y <i>reciente</i>. Si la visita abierta ya es vieja, se asume que
     * esa persona se fue sin marcar: se cierra con la marca {@code autoClosed} y se abre la
     * entrada nueva. Así un olvido cuesta UNA visita imprecisa y nunca contamina lo que viene
     * después.</p>
     */
    @Transactional
    public ScanResult registerScan(UUID memberId, String method, UUID checkinPointId) {
        GymMember member = memberService.findByIdAndVerifyOwnership(memberId);
        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);

        Optional<AccessLog> abierta = accessLogRepository
                .findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(
                        TenantContextHolder.getTenantId(), memberId);

        if (abierta.isPresent()) {
            AccessLog log = abierta.get();
            java.time.Duration desdeEntrada = java.time.Duration.between(log.getCheckInAt(), now);

            // (1) Rebote: el mismo gesto contado dos veces.
            if (desdeEntrada.getSeconds() < REBOTE_SEGUNDOS) {
                return new ScanResult(log, Direction.REBOTE, false);
            }

            // (2) Visita abandonada: se fue sin marcar. Se cierra y se abre la de hoy.
            if (esAbandonada(log.getCheckInAt(), now)) {
                log.setCheckOutAt(cierreEstimado(log.getCheckInAt(), now));
                log.setAutoClosed(true);
                accessLogRepository.save(log);
                return new ScanResult(abrirVisita(member, method, checkinPointId, now), Direction.ENTRADA, true);
            }

            // (3) Visita normal en curso → esto es la salida.
            log.setCheckOutAt(now);
            return new ScanResult(accessLogRepository.save(log), Direction.SALIDA, false);
        }

        return new ScanResult(abrirVisita(member, method, checkinPointId, now), Direction.ENTRADA, false);
    }

    /** Compatibilidad con el mostrador, que ya llamaba así. */
    @Transactional
    public AccessLog registerAccess(UUID memberId, String method) {
        return registerScan(memberId, method, null).log();
    }

    private boolean esAbandonada(LocalDateTime entrada, LocalDateTime now) {
        // Dos criterios, cualquiera alcanza: pasó demasiado tiempo, o cambió el día. El segundo
        // atrapa al que entró a las 23:00 y marca a las 7:00 — solo 8 horas, pero es otra visita.
        return java.time.Duration.between(entrada, now).toHours() >= VISITA_MAXIMA_HORAS
                || !entrada.toLocalDate().equals(now.toLocalDate());
    }

    /**
     * A qué hora cerrar una visita que nadie cerró.
     *
     * <p>Lo obvio sería poner "ahora", pero eso graba visitas de 25 horas: si el socio vuelve el
     * martes, su visita del lunes quedaría durando hasta el martes. Aunque esté marcada, cualquier
     * consulta que se olvide de filtrar la marca devuelve un disparate.</p>
     *
     * <p>Se cierra al final del día en que entró (o ahora, si es más temprano). Sigue siendo una
     * estimación —por eso va marcada— pero está <b>acotada</b>: nunca cruza la medianoche, así que
     * lo peor que puede pasar es una duración inflada, no una imposible.</p>
     */
    private LocalDateTime cierreEstimado(LocalDateTime entrada, LocalDateTime now) {
        LocalDateTime finDelDia = entrada.toLocalDate().atTime(LocalTime.MAX);
        return finDelDia.isBefore(now) ? finDelDia : now;
    }

    private AccessLog abrirVisita(GymMember member, String method, UUID checkinPointId, LocalDateTime now) {
        AccessLog log = new AccessLog();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());

        log.setTenant(tenant);
        log.setMember(member);
        log.setCheckInAt(now);
        log.setAccessMethod(method != null ? method : "MANUAL");
        log.setCheckinPointId(checkinPointId);
        return accessLogRepository.save(log);
    }

    /**
     * Cierra las visitas que quedaron abiertas de días anteriores. Lo corre el trabajo nocturno.
     *
     * <p>Hace falta además del chequeo al escanear: el que se fue sin marcar y <b>no vuelve
     * nunca</b> se quedaría "adentro" para siempre, y el gimnasio mostraría gente a las 4 de la
     * mañana. Sin esto, el contador de "adentro ahora" solo sube.</p>
     *
     * @return cuántas cerró
     */
    @Transactional
    public int cerrarVisitasAbandonadas() {
        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime limite = now.toLocalDate().atStartOfDay(); // todo lo de ayer para atrás

        List<AccessLog> abiertas = accessLogRepository.findByCheckOutAtIsNullAndCheckInAtBefore(limite);
        for (AccessLog log : abiertas) {
            log.setCheckOutAt(cierreEstimado(log.getCheckInAt(), now));
            log.setAutoClosed(true);
        }
        accessLogRepository.saveAll(abiertas);
        return abiertas.size();
    }

    @Transactional
    public AccessLog checkOut(UUID accessLogId) {
        AccessLog log = accessLogRepository.findById(accessLogId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registro de acceso no encontrado"));
                
        if (!log.getTenant().getId().equals(TenantContextHolder.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
        
        if (log.getCheckOutAt() == null) {
            log.setCheckOutAt(LocalDateTime.now(BUSINESS_ZONE));
        }
        
        return accessLogRepository.save(log);
    }
}
