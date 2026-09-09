package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.AccessDenied;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.AccessDeniedRepository;
import com.veltronik.v2.gym.repositories.CheckinPointRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.security.MemberAccessPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * La entrada por molinete: lo que el equipo de reconocimiento facial le cuenta a Veltronik.
 *
 * <p><b>El equipo decide solo.</b> Vive en la red del gimnasio, guarda las caras adentro y
 * reconoce sin preguntarle a nadie — por eso abre en milisegundos y sigue funcionando con el
 * internet caído. Veltronik no autoriza el paso: se entera. Nuestro trabajo es mantenerle la
 * lista al día (eso lo hace el escritorio) y anotar lo que pasó (esto).</p>
 *
 * <p><b>Los tres avisos que manda el equipo</b>, en su vocabulario:</p>
 * <ul>
 *   <li>{@code face_0} — lo reconoció y lo dejó pasar. Es una visita.</li>
 *   <li>{@code face_1} — lo reconoció y NO lo dejó pasar, porque le cerramos el horario por
 *       estar vencido. <b>No es un error: es un socio al que hay que llamar.</b></li>
 *   <li>{@code face_2} — no lo reconoció. Alguien que pasó frente a la cámara. No se guarda:
 *       un desconocido no es un socio con un problema de cuota.</li>
 * </ul>
 *
 * <p><b>Por qué el vencido se frena con el horario y no apagándole la cara.</b> Las dos cosas
 * cierran la puerta, pero apagar el reconocimiento convierte al socio en un desconocido: el
 * aviso llega sin nombre y el mostrador se entera de que "alguien" quiso entrar, que es
 * exactamente el dato que no sirve. Con el horario cerrado el equipo lo reconoce, le muestra
 * el nombre en la pantalla, no le abre, y nosotros sabemos a quién llamar. Probado contra el
 * equipo real: la pantalla dice el nombre y <i>"not in passing time"</i>.</p>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class MolineteService {

    private final CheckinPointRepository pointRepository;
    private final GymMemberRepository memberRepository;
    private final AccessDeniedRepository deniedRepository;
    private final AccessLogService accessLogService;
    private final MemberAccessPolicy accessPolicy;

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    /** Lo que manda el equipo en cada reconocimiento. Todo llega como texto. */
    public record Aviso(String personId, String deviceKey, String type, String time,
                        String passTimeType) {}

    // ─────────────────────────────────────────────────────────────────────────
    // El padrón: la lista que el escritorio le mantiene al día al equipo
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Un socio, como lo necesita el molinete: quién es y si hoy puede pasar.
     *
     * @param id        va al equipo sin guiones; es lo que vuelve en cada aviso
     * @param nombre    lo que muestra la pantalla del equipo cuando lo reconoce
     * @param permitido si le abrimos la ventana horaria o se la cerramos
     */
    public record SocioDelPadron(UUID id, String nombre, boolean permitido) {}

    /**
     * La lista completa de socios del gimnasio con el veredicto ya resuelto.
     *
     * <p><b>El veredicto se calcula ACÁ y no en el escritorio.</b> Es la misma regla que usa el
     * mostrador y el check-in por QR ({@link MemberAccessPolicy}), y ya se aprendió caro que
     * toda cuenta de fechas copiada termina estando mal en alguna de las copias. El escritorio
     * no sabe qué es estar vencido: recibe un sí o un no y lo aplica.</p>
     *
     * <p><b>Quién puede pasar.</b> Al día y en gracia, obviamente. También el que <i>no tiene
     * fecha de vencimiento cargada</i>: eso es un dato que falta —pasa con los migrados y los
     * cargados a las apuradas— y no es lo mismo que deber. Dejar a un socio al día parado en
     * la puerta por un campo vacío es peor que dejar entrar a uno que se fue ayer, y encima
     * hace quedar mal al gimnasio delante de quien sí pagó. Quedan afuera el vencido y el dado
     * de baja.</p>
     *
     * <p>Van TODOS los socios, incluidos los que no pueden pasar: el escritorio necesita
     * distinguir "está y no puede" de "ya no es socio de este gimnasio" — al segundo hay que
     * borrarle la cara del equipo, al primero solo cerrarle el horario.</p>
     */
    @Transactional(readOnly = true)
    public List<SocioDelPadron> padron(UUID tenantId) {
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<SocioDelPadron> padron = new ArrayList<>();
        // Se traen las fichas enteras y no una proyección: la regla de arriba necesita el socio
        // completo, y esto corre cada varios minutos, no cada quince segundos como el mostrador.
        for (GymMember m : memberRepository.findByTenantId(tenantId)) {
            MemberAccessPolicy.Status estado = accessPolicy.evaluate(m, ahora).status();
            padron.add(new SocioDelPadron(m.getId(), nombreDe(m), puedePasar(estado)));
        }
        return padron;
    }

    private static boolean puedePasar(MemberAccessPolicy.Status estado) {
        return estado == MemberAccessPolicy.Status.AL_DIA
                || estado == MemberAccessPolicy.Status.EN_GRACIA
                || estado == MemberAccessPolicy.Status.SIN_DATOS;
    }

    /** La pantalla del equipo corta a los 32 caracteres, así que se recorta acá y no allá. */
    private static String nombreDe(GymMember m) {
        String nombre = ((m.getFirstName() == null ? "" : m.getFirstName()) + " "
                + (m.getLastName() == null ? "" : m.getLastName())).trim();
        if (nombre.isEmpty()) nombre = "Socio";
        return nombre.length() > 32 ? nombre.substring(0, 32) : nombre;
    }

    /** Qué hicimos con el aviso. Sale en los logs y en la respuesta al equipo. */
    public enum Resultado {
        /** Se registró la entrada o la salida del socio. */
        REGISTRADO,
        /** El mismo gesto contado dos veces: el equipo avisa mientras haya una cara enfrente. */
        REPETIDO,
        /** Socio reconocido y frenado. Queda en la lista de a quién llamar. */
        RECHAZADO,
        /** El equipo no reconoció a nadie, o el aviso no trae a quién. */
        DESCONOCIDO,
        /** El token no resuelve ninguna puerta activa, o el serial no es el de esa puerta. */
        NO_AUTORIZADO,
        /** La puerta existe pero el socio que dice el equipo no está en este gimnasio. */
        SOCIO_INEXISTENTE
    }

    /**
     * Recibe un aviso del molinete y lo convierte en lo que corresponda.
     *
     * <p><b>El contexto de tenant se planta a mano y se limpia SIEMPRE.</b> Igual que el
     * check-in por QR: acá el gimnasio no viene de la sesión —el equipo no tiene sesión ni la
     * va a tener— sino del token de la puerta, y esto corre sobre hilos que el servidor
     * reutiliza para otros pedidos. Un contexto que quede pegado sería el peor error posible
     * del sistema: el pedido siguiente leería los datos de otro negocio. De ahí el
     * {@code finally}.</p>
     */
    @Transactional
    public Resultado recibir(String token, Aviso aviso) {
        Optional<CheckinPointRepository.PointLookup> lookup = pointRepository.findByToken(token);
        if (lookup.isEmpty()) {
            log.warn("Aviso de molinete con token desconocido o apagado (serie {}).", aviso.deviceKey());
            return Resultado.NO_AUTORIZADO;
        }
        var punto = lookup.get();
        if (punto.getTenantId() == null) {
            log.error("La puerta {} no resolvió su gimnasio. Revisar la proyección de findByToken.",
                    punto.getPointId());
            return Resultado.NO_AUTORIZADO;
        }

        UUID anterior = TenantContextHolder.getTenantId();
        try {
            TenantContextHolder.setTenantId(punto.getTenantId());
            if (!serialEsperado(punto.getPointId(), aviso.deviceKey())) {
                return Resultado.NO_AUTORIZADO;
            }
            return procesar(punto, aviso);
        } finally {
            if (anterior != null) TenantContextHolder.setTenantId(anterior);
            else TenantContextHolder.clear();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Los rechazados: a quién frenó la puerta y hay que llamar
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Un socio que el molinete no dejó pasar, listo para mostrar en el mostrador.
     *
     * <p>Mismos campos que el aviso del QR ({@link AccessLogService.Aviso}) para que la pantalla
     * los pinte con el mismo componente. La diferencia es de texto, no de forma: al del QR
     * <i>lo dejó entrar</i> y hay que hablarle; a este <b>la puerta lo frenó</b>.</p>
     */
    public record Rechazo(UUID accesoId, UUID socioId, String nombre, String estado,
                          long diasVencido, LocalDateTime hora) {}

    /**
     * Los rechazos de hoy que el mostrador todavía no atendió, con el estado RECALCULADO.
     *
     * <p>El estado se recalcula y no se lee del registro a propósito, igual que en los avisos
     * del QR: el socio pudo pagar en el mostrador entre que la puerta lo frenó y que alguien
     * mire la lista. Si ya está al día, sigue apareciendo —fue frenado en la puerta, eso pasó y
     * conviene saberlo para pedirle disculpas o resincronizar el equipo— pero con su situación
     * de ahora, no con la de hace media hora.</p>
     */
    @Transactional(readOnly = true)
    public List<Rechazo> rechazosPendientes() {
        LocalDateTime desde = java.time.LocalDate.now(BUSINESS_ZONE).atStartOfDay();
        List<AccessDenied> rechazos = deniedRepository
                .findByTenantIdAndAvisoVistoAtIsNullAndOccurredAtAfterOrderByOccurredAtDesc(
                        TenantContextHolder.getTenantId(), desde);

        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<Rechazo> salida = new ArrayList<>();
        for (AccessDenied r : rechazos) {
            GymMember m = r.getMember();
            if (m == null) continue;
            MemberAccessPolicy.Verdict v = accessPolicy.evaluate(m, ahora);
            salida.add(new Rechazo(
                    r.getId(), m.getId(),
                    ((m.getFirstName() == null ? "" : m.getFirstName()) + " "
                            + (m.getLastName() == null ? "" : m.getLastName())).trim(),
                    v.status().name(), v.diasVencido(), r.getOccurredAt()));
        }
        return salida;
    }

    /** El mostrador ya lo habló con el socio: se saca de la lista, en todas las terminales. */
    @Transactional
    public void marcarRechazoVisto(UUID rechazoId) {
        deniedRepository.findById(rechazoId)
                .filter(r -> r.getTenant() != null
                        && r.getTenant().getId().equals(TenantContextHolder.getTenantId()))
                .ifPresent(r -> {
                    r.setAvisoVistoAt(LocalDateTime.now(BUSINESS_ZONE));
                    deniedRepository.save(r);
                });
    }

    /**
     * ¿El aviso viene del equipo que atiende esta puerta?
     *
     * <p>La primera vez la puerta no tiene serial y se queda con el del equipo que avisó. De
     * ahí en más, el que no coincide no entra. El serial no es un secreto —cualquiera en la
     * red del gimnasio se lo pregunta al equipo sin contraseña— así que esto no reemplaza al
     * token: lo ancla. Un token filtrado solo sirve desde el equipo correcto.</p>
     */
    private boolean serialEsperado(UUID pointId, String deviceKey) {
        if (deviceKey == null || deviceKey.isBlank()) return false;
        return pointRepository.findById(pointId).map(punto -> {
            String guardado = punto.getDeviceSerial();
            if (guardado == null || guardado.isBlank()) {
                punto.setDeviceSerial(deviceKey.trim());
                pointRepository.save(punto);
                log.info("Puerta {} apareada con el equipo {}.", punto.getName(), deviceKey);
                return true;
            }
            if (!guardado.equalsIgnoreCase(deviceKey.trim())) {
                log.warn("Aviso rechazado: la puerta {} es del equipo {} y avisó {}.",
                        punto.getName(), guardado, deviceKey);
                return false;
            }
            return true;
        }).orElse(false);
    }

    private Resultado procesar(CheckinPointRepository.PointLookup punto, Aviso aviso) {
        UUID memberId = socioDe(aviso.personId());
        if (memberId == null) return Resultado.DESCONOCIDO;

        Optional<GymMember> socio = memberRepository.findById(memberId)
                .filter(m -> m.getTenant() != null
                        && m.getTenant().getId().equals(TenantContextHolder.getTenantId()));
        if (socio.isEmpty()) {
            // El equipo tiene cargado a alguien que este gimnasio ya no tiene: se borró el socio
            // y nadie lo sacó del molinete. Es una desincronización, no un ataque.
            log.warn("El molinete reconoció a {}, que no es socio de este gimnasio.", aviso.personId());
            return Resultado.SOCIO_INEXISTENTE;
        }

        LocalDateTime ocurridoEn = momentoDelEquipo(aviso.time());

        if (dejoPasar(aviso)) {
            AccessLogService.ScanResult r = accessLogService.registerScan(
                    memberId, AccessLogService.METODO_FACIAL, punto.getPointId(), null,
                    huellaDelAviso(aviso), ocurridoEn);
            return r.direction() == AccessLogService.Direction.REBOTE
                    ? Resultado.REPETIDO
                    : Resultado.REGISTRADO;
        }

        return anotarRechazo(socio.get(), punto, aviso, ocurridoEn);
    }

    /** {@code face_0} y sus primos: el equipo abrió. Cualquier otro final es un rechazo. */
    private static boolean dejoPasar(Aviso aviso) {
        String tipo = aviso.type() == null ? "" : aviso.type().trim();
        return tipo.endsWith("_0");
    }

    /**
     * Anota que un socio quiso entrar y no pudo, salvo que ya lo hayamos anotado recién.
     *
     * <p>El freno es acá y no en memoria a propósito: el backend se reinicia, y corre en más de
     * una instancia. Una lista de avisos que se duplica cuando escala no es una lista.</p>
     */
    private Resultado anotarRechazo(GymMember socio, CheckinPointRepository.PointLookup punto,
                                    Aviso aviso, LocalDateTime ocurridoEn) {
        Optional<AccessDenied> ultimo = deniedRepository
                .findTopByTenantIdAndMemberIdOrderByOccurredAtDesc(
                        TenantContextHolder.getTenantId(), socio.getId());
        boolean recien = ultimo
                .map(a -> java.time.Duration.between(a.getOccurredAt(), ocurridoEn).toMinutes() < RECHAZO_REPETIDO_MIN)
                .orElse(false);
        if (recien) return Resultado.REPETIDO;

        Tenant tenant = new Tenant();
        tenant.setId(TenantContextHolder.getTenantId());

        AccessDenied rechazo = new AccessDenied();
        rechazo.setTenant(tenant);
        rechazo.setMember(socio);
        rechazo.setOccurredAt(ocurridoEn);
        rechazo.setReason(motivo(aviso));
        rechazo.setCheckinPointId(punto.getPointId());
        rechazo.setDeviceSerial(aviso.deviceKey());
        deniedRepository.save(rechazo);
        return Resultado.RECHAZADO;
    }

    /**
     * Cuánto tiene que pasar para que un socio frenado vuelva a contar como un intento nuevo.
     *
     * <p>El vencido que se queda parado esperando que le abra genera un aviso cada pocos
     * segundos. Diez minutos junta todo ese forcejeo en una sola línea, y si vuelve a la tarde
     * —que es información distinta— aparece de nuevo.</p>
     */
    private static final long RECHAZO_REPETIDO_MIN = 10;

    private static String motivo(Aviso aviso) {
        // "2" es "fuera del período horario": es como frenamos al vencido. Cualquier otro
        // rechazo es del equipo (un método de verificación apagado) y se anota como tal.
        return "2".equals(aviso.passTimeType())
                ? AccessDenied.Reason.FUERA_DE_HORARIO
                : AccessDenied.Reason.SIN_PERMISO;
    }

    /**
     * El id de socio que le dimos al equipo, de vuelta en UUID.
     *
     * <p>El equipo solo acepta números y letras en el id de una persona, así que el UUID del
     * socio viaja sin guiones. Se aceptan las dos formas para no depender de eso.</p>
     */
    static UUID socioDe(String personId) {
        String s = personId == null ? "" : personId.trim();
        if (s.length() == 36) {
            try { return UUID.fromString(s); } catch (IllegalArgumentException e) { return null; }
        }
        if (s.length() != 32) return null;  // STRANGERBABY, IDCARD, vacío: no es un socio
        try {
            return UUID.fromString(s.replaceFirst(
                    "(.{8})(.{4})(.{4})(.{4})(.{12})", "$1-$2-$3-$4-$5"));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Un identificador estable de ESTE reconocimiento, para que un reenvío no lo duplique.
     *
     * <p>El equipo guarda los avisos que no pudo entregar y los manda de nuevo cuando vuelve la
     * conexión, pero no les pone número. El serial y el milisegundo sí lo identifican: el mismo
     * equipo no reconoce dos veces en el mismo milisegundo. Derivar de ahí un UUID fijo hace
     * que el reenvío choque contra el índice único de {@code client_ref} en vez de anotar una
     * visita nueva — que además saldría INVERTIDA, porque la dirección se deduce del estado.</p>
     */
    private static UUID huellaDelAviso(Aviso aviso) {
        if (aviso.time() == null || aviso.time().isBlank()) return null;
        return UUID.nameUUIDFromBytes(
                (aviso.deviceKey() + ":" + aviso.time()).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * El reloj del equipo, en hora del negocio.
     *
     * <p>Llega en milisegundos de época, así que no depende de cómo tenga configurada la zona
     * horaria el aparato — que es bueno, porque este equipo informa su zona vacía y rechaza
     * todos los formatos para cambiarla. Si el aviso no trae hora, vale la del servidor.</p>
     *
     * <p>Cuánto se le cree a ese reloj no se decide acá: {@code registerScan} ya acota los
     * momentos inverosímiles, y esa cuenta tiene que vivir en un solo lugar.</p>
     */
    private static LocalDateTime momentoDelEquipo(String time) {
        if (time == null || time.isBlank()) return null;
        try {
            return LocalDateTime.ofInstant(Instant.ofEpochMilli(Long.parseLong(time.trim())), BUSINESS_ZONE);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
