package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.CheckinPoint;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.repositories.CheckinPointRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.security.MemberAccessPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * El check-in por QR: el gimnasio pega un cartel, el socio lo escanea con SU teléfono.
 *
 * <p><b>Por qué así y no al revés.</b> Lo natural sería que el gimnasio escanee al socio, pero
 * eso obliga a comprar un lector o una tablet. Dando vuelta la flecha, el hardware lo pone el
 * socio —ya lo tiene en el bolsillo— y el gimnasio solo imprime un papel. Por eso esta función
 * puede vivir en el plan básico.</p>
 *
 * <p><b>Lo que se pierde y hay que decirlo:</b> con el cartel en la pared, la marca es
 * <i>declarada</i>, no verificada. Alguien puede fotografiar el QR y marcar entrada desde su
 * casa. Para contar asistencias y ver la hora pico da igual (nadie gana nada mintiendo), pero
 * <b>este dato nunca puede usarse para algo que mueva plata ni para una lista de evacuación</b>.
 * Verificar de verdad es lo que hace la cámara del molinete, y eso es premium.</p>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CheckinService {

    private final CheckinPointRepository pointRepository;
    private final GymMemberRepository memberRepository;
    private final AccessLogService accessLogService;
    private final MemberAccessPolicy accessPolicy;

    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Lo que ve el socio en su teléfono después de escanear. */
    public record CheckinResult(
            boolean ok,
            String gimnasio,
            String socio,
            String direccion,        // ENTRADA | SALIDA | REBOTE
            String estado,           // AL_DIA | EN_GRACIA | VENCIDO | SIN_DATOS | INACTIVO
            String titulo,
            String detalle,
            boolean avisarMostrador,
            boolean sonar
    ) {}

    // ─────────────────────────────────────────────────────────────────────────
    // El escaneo
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resuelve un escaneo completo: token del cartel + documento del socio.
     *
     * <p><b>El contexto de tenant se planta a mano y se limpia SIEMPRE.</b> Este es el único
     * camino de la app donde el gimnasio no viene de la sesión sino de un token, y corre sobre
     * hilos que el servidor reutiliza para otros pedidos. Un contexto que quede pegado sería
     * el peor error posible del sistema: el pedido siguiente leería los datos de otro negocio.
     * De ahí el {@code finally}.</p>
     */
    /**
     * Cuántos socios distintos puede marcar un mismo teléfono antes de que valga la pena que
     * alguien lo mire. Dos es normal —una pareja que comparte el celular—; de tres para arriba
     * ya no parece un hogar.
     */
    private static final long SOCIOS_POR_TELEFONO_TOLERADOS = 2;

    /** Ventana en la que se mira ese patrón. Un mes: suficiente para ver una costumbre. */
    private static final int DIAS_DE_PATRON = 30;

    @Transactional
    public CheckinResult scan(String token, String documento, UUID scannerId) {
        Optional<CheckinPointRepository.PointLookup> lookup = pointRepository.findByToken(token);
        if (lookup.isEmpty()) {
            // Mismo mensaje para token inexistente que para desactivado: si dijéramos cuál es,
            // le estaríamos confirmando a cualquiera qué tokens existen.
            return error("Este código no está activo", "Pedile al mostrador el cartel actualizado.");
        }
        var punto = lookup.get();

        // El cartel existe pero no pudimos leer a qué gimnasio pertenece. Es imposible en
        // condiciones normales, y por eso hay que gritarlo: la primera versión de la consulta
        // devolvía la fila con TODOS los campos en null (los alias iban en snake_case y Spring
        // los busca en camelCase). Con el gimnasio en null, la búsqueda del socio preguntaba
        // por un negocio inexistente y contestaba "No te encontramos" — culpando al socio de
        // un error del sistema, con su documento bien puesto. Un fallo que MIENTE sobre su
        // causa cuesta días; uno que se anuncia, minutos.
        if (punto.getTenantId() == null) {
            log.error("El cartel {} no resolvió su gimnasio. Revisar la proyección de findByToken.",
                    punto.getPointId());
            return error("Algo anda mal de nuestro lado",
                    "Pedile al mostrador que te marque la entrada mientras lo resolvemos.");
        }

        String doc = documento == null ? "" : documento.trim();
        if (doc.isEmpty()) {
            return error("Falta tu documento", "Escribí tu DNI sin puntos para poder identificarte.");
        }

        UUID anterior = TenantContextHolder.getTenantId();
        try {
            TenantContextHolder.setTenantId(punto.getTenantId());
            return resolverSocio(punto, doc, scannerId);
        } finally {
            if (anterior != null) TenantContextHolder.setTenantId(anterior);
            else TenantContextHolder.clear();
        }
    }

    /**
     * Deja el documento en su esencia: solo letras y números, en mayúsculas.
     *
     * <p>Un DNI es un número; los puntos son adorno de impresión. En la ficha puede estar
     * {@code 30.111.222} y el socio escribir {@code 30111222} —o pegarlo con un espacio de
     * más— y son la misma persona. Se limpian los DOS lados y recién ahí se comparan.</p>
     */
    static String normalizarDocumento(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^0-9A-Za-z]", "").toUpperCase();
    }

    private CheckinResult resolverSocio(CheckinPointRepository.PointLookup punto, String doc, UUID scannerId) {
        String normalizado = normalizarDocumento(doc);
        if (normalizado.isEmpty()) {
            return error("Falta tu documento", "Escribí tu DNI sin puntos para poder identificarte.");
        }

        List<GymMember> encontrados =
                memberRepository.findByDocumentoNormalizado(punto.getTenantId(), normalizado);

        if (encontrados.isEmpty()) {
            // Al WARN va el gimnasio y la LONGITUD del documento, nunca el número: alcanza para
            // distinguir "escribió mal" de "el cartel apunta a la sucursal equivocada" sin dejar
            // documentos de socios escritos en los logs.
            log.warn("Check-in sin match: gimnasio {} ({}), documento de {} caracteres.",
                    punto.getGymName(), punto.getTenantId(), normalizado.length());
            return error("No te encontramos",
                    "Revisá el número, o pedile al mostrador que cargue tu documento en tu ficha.",
                    punto.getGymName());
        }
        if (encontrados.size() > 1) {
            // Cargaron dos veces a la misma persona. No adivinamos cuál es: marcar la entrada
            // en la ficha equivocada deja al socio figurando ausente y al dato inservible.
            // Sin el documento en el log: acá alcanza con saber en qué gimnasio pasa.
            log.warn("Documento duplicado en el gimnasio {} ({} fichas). Check-in bloqueado.",
                    punto.getTenantId(), encontrados.size());
            return error("Tenés dos fichas cargadas", "Avisale al mostrador así unifican tu ficha.",
                    punto.getGymName());
        }

        GymMember member = encontrados.get(0);
        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        MemberAccessPolicy.Verdict veredicto = accessPolicy.evaluate(member, now);

        AccessLogService.ScanResult scan =
                accessLogService.registerScan(member.getId(), "QR", punto.getPointId(), scannerId);

        return armarRespuesta(punto, member, veredicto, scan, scannerId);
    }

    private CheckinResult armarRespuesta(CheckinPointRepository.PointLookup punto,
                                         GymMember member,
                                         MemberAccessPolicy.Verdict v,
                                         AccessLogService.ScanResult scan,
                                         UUID scannerId) {
        // SOLO el nombre de pila viaja al teléfono.
        //
        // El check-in se identifica con un DNI, que no es secreto: cualquiera puede escribir uno
        // y ver qué contesta. Devolver el apellido convertía el cartel de la pared en una
        // consulta de padrón — "¿fulano es socio acá?" con nombre y apellido. Con el nombre de
        // pila, el socio se reconoce y confirma que marcó bien, y el curioso no se lleva nada
        // que no supiera.
        String nombre = nullSafe(member.getFirstName()).trim();
        String dir = scan.direction().name();

        // El rebote no es un evento: es el mismo gesto contado dos veces. Se lo confirmamos con
        // calma en vez de decirle que salió, que sería mentira y lo haría escanear otra vez.
        if (scan.direction() == AccessLogService.Direction.REBOTE) {
            return new CheckinResult(true, punto.getGymName(), nombre, dir, v.status().name(),
                    "Ya estabas registrado", "Tu entrada de hoy ya quedó marcada.", false, false);
        }

        boolean esEntrada = scan.direction() == AccessLogService.Direction.ENTRADA;
        String titulo = esEntrada ? "¡Hola, " + member.getFirstName() + "!" : "¡Hasta luego!";
        String detalle = esEntrada ? "Entrada registrada." : "Salida registrada. Buen entrenamiento.";

        if (scan.recuperado()) {
            detalle += " (La vez anterior te fuiste sin marcar la salida.)";
        }

        // La situación de la cuota solo se avisa al ENTRAR. Al que ya entrenó y se está yendo no
        // se le cobra en la puerta: es tarde, es incómodo, y no cambia nada.
        boolean avisar = false;
        boolean sonar = false;
        if (esEntrada && v.necesitaAviso()) {
            switch (v.status()) {
                case EN_GRACIA -> {
                    detalle = "Entrada registrada. Tu cuota venció hace " + v.diasVencido()
                            + (v.diasVencido() == 1 ? " día" : " días") + " — pasá por el mostrador cuando puedas.";
                    avisar = true; sonar = true;
                }
                case VENCIDO -> {
                    detalle = "Entrada registrada. Tu cuota está vencida — acercate al mostrador, por favor.";
                    avisar = true; sonar = true;
                }
                case INACTIVO -> {
                    titulo = "Hablá con el mostrador";
                    detalle = "Tu ficha figura dada de baja.";
                    avisar = true; sonar = true;
                }
                // Falta la fecha de vencimiento en su ficha: es un dato incompleto del gimnasio,
                // NO una deuda. Al socio no se le dice nada; el mostrador lo completa.
                case SIN_DATOS -> avisar = true;
                default -> { /* AL_DIA no llega acá */ }
            }
        }

        // ¿Este teléfono viene marcando a nombre de varias personas?
        //
        // Como el DNI alcanza para marcar, alguien podría hacerlo por otro. Cerrarlo del todo
        // pedía un PIN por socio; la decisión fue no agregar fricción pero dejar rastro. Dos
        // socios en un mismo teléfono es normal (una pareja); de tres para arriba ya no parece
        // un hogar y el mostrador se entera.
        //
        // El sistema NO acusa a nadie: no bloquea, no avisa al socio, no dice nada en pantalla.
        // Solo levanta la mano para que lo mire una persona, que es quien puede saber si es una
        // pareja o una avivada.
        if (scannerId != null && !avisar) {
            long distintos = accessLogService.sociosDistintosDelTelefono(scannerId, DIAS_DE_PATRON);
            if (distintos > SOCIOS_POR_TELEFONO_TOLERADOS) {
                log.info("Teléfono con {} socios distintos en {} días (gimnasio {}).",
                        distintos, DIAS_DE_PATRON, punto.getTenantId());
                avisar = true;
            }
        }

        return new CheckinResult(true, punto.getGymName(), nombre, dir, v.status().name(),
                titulo, detalle, avisar, sonar);
    }

    private CheckinResult error(String titulo, String detalle) {
        return error(titulo, detalle, null);
    }

    /**
     * Error diciendo EN QUÉ GIMNASIO se buscó.
     *
     * <p>Con varias sucursales, "no te encontramos" a secas es indescifrable: el socio no tiene
     * cómo saber que el cartel que escaneó es de otra sede. Nombrar la sucursal convierte un
     * misterio en algo obvio de leer.</p>
     */
    private CheckinResult error(String titulo, String detalle, String gimnasio) {
        return new CheckinResult(false, gimnasio, null, null, null, titulo, detalle, false, false);
    }

    private static String nullSafe(String s) { return s == null ? "" : s; }

    // ─────────────────────────────────────────────────────────────────────────
    // El cartel
    // ─────────────────────────────────────────────────────────────────────────

    /** Los carteles activos del gimnasio actual. */
    @Transactional(readOnly = true)
    public List<CheckinPoint> puntosActivos() {
        return pointRepository.findByTenantIdAndActiveTrueOrderByCreatedAtDesc(TenantContextHolder.getTenantId());
    }

    /**
     * Crea un cartel nuevo. Si {@code reemplazar} viene, apaga ese —rotación— en vez de borrarlo:
     * los accesos ya registrados le apuntan y queremos poder decir por qué puerta entró alguien
     * el mes pasado.
     */
    @Transactional
    public CheckinPoint crearPunto(String nombre, UUID reemplazar) {
        if (reemplazar != null) {
            pointRepository.findById(reemplazar)
                    .filter(p -> p.getTenant() != null
                            && p.getTenant().getId().equals(TenantContextHolder.getTenantId()))
                    .ifPresent(p -> { p.setActive(false); pointRepository.save(p); });
        }

        com.veltronik.v2.core.entities.Tenant tenant = new com.veltronik.v2.core.entities.Tenant();
        tenant.setId(TenantContextHolder.getTenantId());

        CheckinPoint punto = new CheckinPoint();
        punto.setTenant(tenant);
        punto.setToken(nuevoToken());
        punto.setName(nombre == null || nombre.isBlank() ? "Puerta principal" : nombre.trim());
        punto.setActive(true);
        return pointRepository.save(punto);
    }

    /**
     * Token del QR: 32 caracteres de azar criptográfico.
     *
     * <p>No es un id incremental ni un UUID del negocio: el cartel queda colgado a la vista de
     * cualquiera y se le puede sacar una foto. Tiene que ser imposible de adivinar (para que
     * nadie marque entradas en un gimnasio que no conoce) y desechable (para poder rotarlo el
     * día que alguien copie el cartel).</p>
     */
    private String nuevoToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
