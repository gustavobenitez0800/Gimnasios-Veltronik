package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessLog;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.security.MemberAccessPolicy;
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
    private final MemberAccessPolicy accessPolicy;

    public AccessLogService(
            AccessLogRepository accessLogRepository,
            GymMemberService memberService,
            MemberAccessPolicy accessPolicy,
            @org.springframework.beans.factory.annotation.Value(
                    "${veltronik.gym.access.max-visit-hours:6}") long visitaMaximaHoras) {
        this.accessLogRepository = accessLogRepository;
        this.memberService = memberService;
        this.accessPolicy = accessPolicy;
        this.visitaMaximaHoras = visitaMaximaHoras;
    }

    /** Zona del negocio (Argentina): "hoy" y los rangos se calculan en hora AR, no UTC. */
    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    /** Cuántos minutos hacia atrás cuenta como "recién entró". */
    private static final int VENTANA_INGRESOS_MIN = 5;

    /**
     * Hasta cuántas horas atrás se le cree al reloj del terminal.
     *
     * <p>36 horas cubre el caso real —el internet se cayó ayer y volvió hoy— sin abrir la
     * puerta a que un reloj desconfigurado escriba visitas en meses ya cerrados.</p>
     */
    private static final int ATRASO_MAXIMO_HORAS = 36;

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

    /**
     * Los números del día, calculados acá para no tener que mandar la lista entera.
     *
     * <p>La pantalla muestra 30 filas pero necesita el total y el promedio de TODO el día.
     * Antes se mandaban los accesos completos —cada uno con la ficha del socio— y el
     * frontend los contaba: en un gimnasio con 250 entradas eso son cientos de fichas
     * viajando por la conexión del gimnasio cada quince segundos, para pintar dos números.</p>
     *
     * @param delDia la lista que ya se trajo; no vuelve a consultar
     */
    public ResumenDelDia resumirDia(List<AccessLog> delDia) {
        long completadas = 0;
        long minutos = 0;
        for (AccessLog a : delDia) {
            if (a.getCheckOutAt() == null || a.getCheckInAt() == null) continue;
            completadas++;
            minutos += java.time.Duration.between(a.getCheckInAt(), a.getCheckOutAt()).toMinutes();
        }
        // Sin visitas cerradas no hay promedio que informar. Cero seria mentira: diria que
        // la gente entra y sale en el acto.
        Integer promedio = completadas == 0 ? null : (int) Math.round((double) minutos / completadas);
        return new ResumenDelDia(delDia.size(), promedio);
    }

    /** @param promedioMin null = todavía no cerró ninguna visita. */
    public record ResumenDelDia(int total, Integer promedioMin) {}

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
     *
     * <p>Configurable porque el número correcto depende del negocio: un gimnasio de barrio no
     * es lo mismo que uno con pileta y sauna donde la gente pasa la tarde. Un valor demasiado
     * corto parte visitas reales en dos; uno demasiado largo deja gente "adentro" de más.</p>
     */
    private final long visitaMaximaHoras;

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
    /**
     * <p><b>Los accesos que llegan tarde.</b> El terminal del mostrador registra sin internet y
     * manda cuando vuelve. Eso obliga a dos cosas más:</p>
     *
     * <ul>
     *   <li>{@code clientRef}: si este acceso ya se guardó, se devuelve el que está y no se
     *       hace nada. Un reintento no puede duplicar — y sobre todo no puede INVERTIR, que
     *       es lo que pasaría si se procesara de nuevo: la dirección se deduce del estado, así
     *       que la segunda vez daría salida donde hubo entrada.</li>
     *   <li>{@code ocurridoEn}: la dirección se evalúa contra el momento en que PASÓ, no
     *       contra el momento en que llegó. Un acceso de las 10:00 que llega 10:45 tiene que
     *       leerse con el mundo de las 10:00, o sale al revés.</li>
     * </ul>
     */
    @Transactional
    public ScanResult registerScan(UUID memberId, String method, UUID checkinPointId, UUID scannerId,
                                   UUID clientRef, LocalDateTime ocurridoEn) {
        // (0) ¿Ya lo guardamos? Antes de tocar nada.
        if (clientRef != null) {
            Optional<AccessLog> yaEstaba = accessLogRepository
                    .findByTenantIdAndClientRef(TenantContextHolder.getTenantId(), clientRef);
            if (yaEstaba.isPresent()) {
                return new ScanResult(yaEstaba.get(), direccionDe(yaEstaba.get()), false);
            }
        }

        GymMember member = memberService.findByIdAndVerifyOwnership(memberId);
        LocalDateTime now = momentoDelHecho(ocurridoEn);

        Optional<AccessLog> abierta = accessLogRepository
                .findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(
                        TenantContextHolder.getTenantId(), memberId);

        if (abierta.isPresent()) {
            AccessLog log = abierta.get();
            java.time.Duration desdeEntrada = java.time.Duration.between(log.getCheckInAt(), now);

            // (1) Rebote: el mismo gesto contado dos veces.
            //
            // SOLO aplica al QR. El freno existe para el dedo que tiembla y para el teléfono
            // que lee el código dos veces — cosas del celular. Una recepcionista apretando un
            // botón es SIEMPRE deliberada: si el socio escanea al entrar y ella marca algo
            // diez segundos después, son dos acciones distintas, no un temblor. Tragarse la
            // segunda dejaba al mostrador sin poder corregir nada durante quince segundos.
            if (esPorQr(method) && desdeEntrada.getSeconds() < REBOTE_SEGUNDOS) {
                return new ScanResult(log, Direction.REBOTE, false);
            }

            // (2) Visita abandonada: se fue sin marcar. Se cierra y se abre la de hoy.
            if (esAbandonada(log.getCheckInAt(), now)) {
                log.setCheckOutAt(cierreEstimado(log.getCheckInAt(), now));
                log.setAutoClosed(true);
                accessLogRepository.save(log);
                return new ScanResult(abrirVisita(member, method, checkinPointId, scannerId, now, clientRef), Direction.ENTRADA, true);
            }

            // (3) Visita normal en curso → esto es la salida.
            //
            // El sello del terminal se guarda TAMBIÉN en la salida. Si no, un reintento de
            // una salida no se reconocería como repetida, y al reprocesarse abriría una
            // visita nueva: el socio quedaría "adentro" justo después de haberse ido.
            log.setCheckOutAt(now);
            if (clientRef != null) log.setClientRef(clientRef);
            return new ScanResult(accessLogRepository.save(log), Direction.SALIDA, false);
        }

        return new ScanResult(abrirVisita(member, method, checkinPointId, scannerId, now, clientRef), Direction.ENTRADA, false);
    }

    /**
     * Cuándo pasó este acceso, con el reloj del terminal puesto en su lugar.
     *
     * <p><b>El reloj del cliente no se cree, se acota.</b> La máquina de un mostrador puede
     * tener la hora mal por meses —nadie la mira— y con ella se decide si un socio entró o
     * salió, y en qué día contó su visita. Se aceptan solo momentos verosímiles:</p>
     *
     * <ul>
     *   <li><b>En el futuro</b> → se usa ahora. Un acceso no puede haber pasado todavía, y
     *       aceptarlo dejaría al socio "adentro" hasta que el reloj del servidor lo alcance.</li>
     *   <li><b>Más viejo que el límite</b> → se usa el límite. Un corte de internet de un día
     *       es creíble; uno de tres meses es un reloj roto, y meter esa visita en marzo
     *       ensuciaría un mes ya cerrado.</li>
     * </ul>
     *
     * <p>Se acota en vez de rechazar a propósito: el acceso PASÓ, alguien entró al gimnasio.
     * Perderlo por no confiar en un reloj sería peor que guardarlo con la hora corrida.</p>
     */
    private LocalDateTime momentoDelHecho(LocalDateTime ocurridoEn) {
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        if (ocurridoEn == null) return ahora;
        if (ocurridoEn.isAfter(ahora)) return ahora;
        LocalDateTime masViejoAceptable = ahora.minusHours(ATRASO_MAXIMO_HORAS);
        return ocurridoEn.isBefore(masViejoAceptable) ? masViejoAceptable : ocurridoEn;
    }

    /**
     * Qué fue este acceso, mirando el registro guardado.
     *
     * <p>Se usa al reconocer un reintento: hay que contestarle al terminal lo MISMO que se le
     * contestó la primera vez, y la dirección no se guarda —se deduce—. Con la salida puesta
     * fue una salida; sin ella, la entrada sigue abierta.</p>
     */
    private static Direction direccionDe(AccessLog log) {
        return log.getCheckOutAt() != null ? Direction.SALIDA : Direction.ENTRADA;
    }

    /**
     * La visita abierta de este socio, si tiene una. La consulta el teléfono —a través del
     * check-in— para saber si ofrecerle marcar entrada o salida.
     */
    @Transactional(readOnly = true)
    public Optional<AccessLog> visitaAbiertaDe(UUID memberId) {
        return accessLogRepository.findTopByTenantIdAndMemberIdAndCheckOutAtIsNullOrderByCheckInAtDesc(
                TenantContextHolder.getTenantId(), memberId);
    }

    /** Compatibilidad con el mostrador, que ya llamaba así. Sin cola: pasa ahora. */
    @Transactional
    public AccessLog registerAccess(UUID memberId, String method) {
        return registerScan(memberId, method, null, null, null, null).log();
    }

    /**
     * ¿Esta visita abierta es alguien adentro, o alguien que se fue sin marcar?
     *
     * <p><b>Solo cuenta el tiempo transcurrido.</b> La primera versión agregaba "o cambió el
     * día", y eso rompía a cualquier gimnasio abierto después de medianoche: el socio que
     * entraba a las 23:00 y salía a las 00:30 tenía una visita de hora y media —vivísima— pero
     * el cambio de fecha la marcaba como abandonada. Resultado: su salida se convertía en una
     * ENTRADA nueva. Tocaba "marcar salida", el sistema le contestaba "entrada registrada", y
     * el botón volvía a decir "marcar salida". Parecía trabado, y en cierto modo lo estaba.</p>
     *
     * <p>La cláusula del día tampoco agregaba nada: el caso que decía cubrir —entró 23:00,
     * vuelve 7:00— son ocho horas, y el umbral de tiempo ya lo atrapa solo.</p>
     */
    /** ¿La marca viene del cartel de la puerta, o de una persona en el mostrador? */
    private static boolean esPorQr(String method) {
        return "QR".equalsIgnoreCase(method == null ? "" : method.trim());
    }

    private boolean esAbandonada(LocalDateTime entrada, LocalDateTime now) {
        return java.time.Duration.between(entrada, now).toHours() >= visitaMaximaHoras;
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

    private AccessLog abrirVisita(GymMember member, String method, UUID checkinPointId,
                                  UUID scannerId, LocalDateTime now, UUID clientRef) {
        AccessLog log = new AccessLog();
        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());

        log.setTenant(tenant);
        log.setMember(member);
        log.setCheckInAt(now);
        log.setAccessMethod(method != null ? method : "MANUAL");
        log.setCheckinPointId(checkinPointId);
        log.setScannerId(scannerId);
        log.setClientRef(clientRef);
        AccessLog guardado = accessLogRepository.save(log);

        consumirClase(member);
        return guardado;
    }

    /**
     * Descuenta una visita del cupo del socio.
     *
     * <p><b>Solo al ENTRAR.</b> Está acá adentro y no en {@code registerScan} justamente por
     * eso: este método es el único lugar donde nace una visita, así que el descuento no puede
     * dispararse por una salida ni por un rebote. Poner la resta arriba, en el switch de
     * direcciones, habría significado acordarse de no restar en tres caminos distintos — y
     * olvidarse en uno solo es cobrarle al socio una clase que no usó.</p>
     *
     * <p><b>NULL se respeta.</b> Un socio sin cupo (la enorme mayoría, y todos los gimnasios
     * que no usan esta función) sigue con NULL: no se le empieza a contar nada por el hecho de
     * entrar.</p>
     *
     * <p><b>Nunca baja de cero.</b> El que entra con el cupo agotado —porque el mostrador lo
     * dejó pasar igual, que es una decisión legítima del gimnasio— no acumula clases negativas
     * que después haya que compensar al cobrar.</p>
     */
    private void consumirClase(GymMember member) {
        Integer quedan = member.getClassesRemaining();
        if (quedan == null) return;
        member.setClassesRemaining(Math.max(0, quedan - 1));
        memberService.saveForCurrentTenant(member);
    }

    /**
     * ¿Cuántos socios distintos marcó este teléfono en los últimos días?
     *
     * <p>Lo normal es 1: cada uno marca con el suyo. Más que eso puede ser una pareja que
     * comparte teléfono —legítimo— o alguien usando documentos ajenos. El sistema no decide
     * cuál de las dos: lo muestra para que lo mire una persona.</p>
     */
    @Transactional(readOnly = true)
    public long sociosDistintosDelTelefono(UUID scannerId, int dias) {
        if (scannerId == null) return 0;
        return accessLogRepository.countSociosDistintosPorScanner(
                TenantContextHolder.getTenantId(), scannerId,
                LocalDateTime.now(BUSINESS_ZONE).minusDays(dias));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Avisos para el mostrador
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Un socio que acaba de pasar por el QR, con su situación resuelta.
     *
     * <p>Lleva los MISMOS campos que la búsqueda del mostrador ({@code situacion},
     * {@code diasRestantes}, {@code clasesRestantes}) para que la pantalla lo pinte con el
     * mismo código que usa cuando la recepcionista registra la entrada a mano. Si acá se
     * inventara otro formato, habría dos maneras de decir lo mismo y una se iba a quedar
     * atrás.</p>
     */
    public record Ingreso(UUID accesoId, UUID socioId, String nombre, String situacion,
                          long diasVencido, long diasRestantes, Integer clasesRestantes,
                          LocalDateTime hora) {}

    /**
     * Los pasos por QR de los últimos minutos, al día o no.
     *
     * <p><b>Por qué existe.</b> Cuando el socio escanea el cartel, la confirmación aparece en
     * SU teléfono. La pantalla del mostrador —que está a la vista de todos— no decía nada:
     * el socio no tenía dónde mirar cuántos días le quedan sin preguntarle a alguien. Ahora
     * el mostrador muestra lo mismo que cuando la entrada se registra a mano.</p>
     *
     * <p>La ventana es corta a propósito. Esto no es un historial —para eso está la lista de
     * hoy— sino "lo que acaba de pasar": lo que la pantalla convierte en un cartel de unos
     * segundos. Traer todo el día haría crecer un pedido que se repite cada quince segundos
     * para mostrar, casi siempre, nada nuevo.</p>
     */
    public List<Ingreso> ingresosRecientes() {
        LocalDateTime desde = LocalDateTime.now(BUSINESS_ZONE).minusMinutes(VENTANA_INGRESOS_MIN);
        List<AccessLog> accesos = accessLogRepository
                .findByTenantIdAndAccessMethodAndCheckInAtAfterOrderByCheckInAtDesc(
                        TenantContextHolder.getTenantId(), "QR", desde);

        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<Ingreso> ingresos = new java.util.ArrayList<>();
        for (AccessLog a : accesos) {
            GymMember m = a.getMember();
            if (m == null) continue;
            MemberAccessPolicy.Verdict v = accessPolicy.evaluate(m, ahora);
            ingresos.add(new Ingreso(
                    a.getId(), m.getId(),
                    (nullSafe(m.getFirstName()) + " " + nullSafe(m.getLastName())).trim(),
                    v.status().name(), v.diasVencido(), v.diasRestantes(), v.clasesRestantes(),
                    a.getCheckInAt()));
        }
        return ingresos;
    }

    /** Un socio que entró por QR y necesita que alguien le hable. */
    public record Aviso(UUID accesoId, UUID socioId, String nombre, String estado,
                        long diasVencido, LocalDateTime hora) {}

    /**
     * Los socios que entraron solos y necesitan atención, de hoy y sin atender todavía.
     *
     * <p><b>Por qué existe:</b> con el check-in por QR el socio vencido entra sin que nadie lo
     * vea — el aviso aparece en SU teléfono y ahí muere. La recepcionista se enteraría recién
     * si mirara la lista de accesos y cruzara a mano el estado de cada uno, o sea nunca.</p>
     *
     * <p>El veredicto se calcula ACÁ y no se guarda al escanear a propósito: la situación del
     * socio cambia. Si entró vencido a las 9 y pagó a las 10, a las 11 ya no hay nada que
     * avisar, y un aviso congelado mandaría a la recepcionista a reclamarle a alguien que
     * está al día. Recalcular cuesta nada y siempre dice la verdad de este momento.</p>
     */
    @Transactional(readOnly = true)
    public List<Aviso> avisosPendientes() {
        LocalDateTime desde = LocalDate.now(BUSINESS_ZONE).atStartOfDay();
        List<AccessLog> accesos = accessLogRepository
                .findByTenantIdAndAccessMethodAndAvisoVistoAtIsNullAndCheckInAtAfterOrderByCheckInAtDesc(
                        TenantContextHolder.getTenantId(), "QR", desde);

        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<Aviso> avisos = new java.util.ArrayList<>();
        for (AccessLog a : accesos) {
            GymMember m = a.getMember();
            if (m == null) continue;
            MemberAccessPolicy.Verdict v = accessPolicy.evaluate(m, ahora);
            if (!v.necesitaAviso()) continue;
            avisos.add(new Aviso(
                    a.getId(), m.getId(),
                    (nullSafe(m.getFirstName()) + " " + nullSafe(m.getLastName())).trim(),
                    v.status().name(), v.diasVencido(), a.getCheckInAt()));
        }
        return avisos;
    }

    /** El mostrador ya lo habló con el socio: se saca de la lista. */
    @Transactional
    public void marcarAvisoVisto(UUID accesoId) {
        accessLogRepository.findById(accesoId)
                .filter(a -> a.getTenant() != null
                        && a.getTenant().getId().equals(TenantContextHolder.getTenantId()))
                .ifPresent(a -> {
                    a.setAvisoVistoAt(LocalDateTime.now(BUSINESS_ZONE));
                    accessLogRepository.save(a);
                });
    }

    private static String nullSafe(String s) { return s == null ? "" : s; }

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
