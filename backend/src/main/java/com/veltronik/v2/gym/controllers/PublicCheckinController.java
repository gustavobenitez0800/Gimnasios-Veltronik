package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.services.CheckinService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * El check-in del socio. <b>Endpoint público sin login</b>: el que llama es alguien con un
 * teléfono en la puerta del gimnasio, y los socios no tienen cuenta en Veltronik.
 *
 * <p>Vive bajo {@code /api/public/**}, que es {@code permitAll} y está excluido del KillSwitch
 * — igual que la config de pago. Tiene que contestar sin sesión y en cualquier estado.</p>
 *
 * <p><b>Que sea público obliga a cuidar dos cosas</b>, y las dos están resueltas acá:</p>
 * <ul>
 *   <li>El token del cartel es lo único que autoriza a tocar los datos de ese gimnasio, así que
 *       se resuelve contra la base en cada pedido y nunca se confía en nada más del cuerpo.</li>
 *   <li>Sin freno, cualquiera podría probar documentos en serie contra un gimnasio y averiguar
 *       quiénes son sus socios. De ahí el limitador de abajo.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
@Slf4j
public class PublicCheckinController {

    private final CheckinService checkinService;

    /**
     * Freno anti-tanteo, en memoria.
     *
     * <p>Cuenta solo los intentos FALLIDOS por token. Un gimnasio real falla poquísimo —el socio
     * se equivoca un dígito y lo corrige— así que 10 por minuto no molesta a nadie. El que
     * quiere barrer documentos, en cambio, necesita miles.</p>
     *
     * <p>En memoria y no en base a propósito: si el backend se reinicia se pierde el contador, y
     * está bien. Es un freno, no una auditoría, y no vale un viaje a la base por escaneo.</p>
     */
    private static final int MAX_FALLOS_POR_MINUTO = 10;

    /**
     * Tope de escaneos TOTALES por minuto y por cartel, aciertos incluidos.
     *
     * <p><b>Por qué no alcanzaba con frenar los fallos.</b> Un acierto también revela algo: la
     * pantalla contesta con el nombre del socio. Alguien con una lista de documentos podía ir
     * probando y, sin fallar nunca, averiguar quiénes son socios del gimnasio — el freno de
     * fallos no lo tocaba. Con este tope, cualquier barrido choca contra la pared.</p>
     *
     * <p>40 por minuto es holgadísimo para una puerta real: en la hora pico de un gimnasio
     * grande entran unas pocas personas por minuto. Un socio nunca lo va a ver.</p>
     */
    private static final int MAX_ESCANEOS_POR_MINUTO = 40;

    private final ConcurrentHashMap<String, Ventana> frenos = new ConcurrentHashMap<>();

    private static final class Ventana {
        volatile long desde = Instant.now().getEpochSecond();
        final AtomicInteger fallos = new AtomicInteger();
        final AtomicInteger total = new AtomicInteger();
    }

    @PostMapping("/checkin")
    public ResponseEntity<?> checkin(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        String documento = body.get("documento");

        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false,
                    "titulo", "Código inválido",
                    "detalle", "Volvé a escanear el cartel de la entrada."));
        }

        if (frenado(token)) {
            log.warn("Check-in frenado por exceso de intentos fallidos (token …{}).", cola(token));
            return ResponseEntity.status(429).body(Map.of(
                    "ok", false,
                    "titulo", "Probaste demasiadas veces",
                    "detalle", "Esperá un minuto, o pedile al mostrador que te marque la entrada."));
        }

        // El identificador del teléfono es opcional y anónimo: un número al azar que el propio
        // aparato se genera. Si viene mal formado se ignora en vez de rechazar el escaneo —
        // el socio no tiene por qué quedarse afuera por un dato accesorio.
        UUID scannerId = null;
        String scannerRaw = body.get("scannerId");
        if (scannerRaw != null && !scannerRaw.isBlank()) {
            try { scannerId = UUID.fromString(scannerRaw.trim()); } catch (IllegalArgumentException ignored) { }
        }

        CheckinService.CheckinResult r = checkinService.scan(token, documento, scannerId);
        registrarIntento(token, r.ok());

        return ResponseEntity.ok(r);
    }

    /**
     * ¿El socio está adentro ahora? Lo pregunta el teléfono para escribir bien el botón.
     *
     * <p><b>POST y no GET</b>: el documento va en el cuerpo, nunca en la URL. Un dato personal
     * en una dirección web queda en el historial del navegador y en los registros del
     * servidor, y ninguno de los dos es lugar para el DNI de un socio.</p>
     *
     * <p>Cuenta contra el mismo freno que el escaneo: es la misma superficie pública y sería
     * absurdo limitar una puerta y dejar la otra abierta de par en par.</p>
     */
    @PostMapping("/checkin/estado")
    public ResponseEntity<?> estado(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            return ResponseEntity.ok(Map.of("adentro", false));
        }
        if (frenado(token)) {
            return ResponseEntity.status(429).body(Map.of("adentro", false));
        }
        registrarIntento(token, true);
        return ResponseEntity.ok(checkinService.estado(token, body.get("documento")));
    }

    private boolean frenado(String token) {
        Ventana v = frenos.get(token);
        if (v == null) return false;
        if (Instant.now().getEpochSecond() - v.desde >= 60) {
            frenos.remove(token);
            return false;
        }
        return v.fallos.get() >= MAX_FALLOS_POR_MINUTO
                || v.total.get() >= MAX_ESCANEOS_POR_MINUTO;
    }

    private void registrarIntento(String token, boolean ok) {
        Ventana v = frenos.computeIfAbsent(token, k -> new Ventana());
        if (Instant.now().getEpochSecond() - v.desde >= 60) {
            v.desde = Instant.now().getEpochSecond();
            v.fallos.set(0);
            v.total.set(0);
        }
        v.total.incrementAndGet();
        if (!ok) v.fallos.incrementAndGet();
    }

    /** Últimos caracteres del token, para poder rastrear en los logs sin publicarlo entero. */
    private static String cola(String token) {
        return token.length() <= 6 ? "?" : token.substring(token.length() - 6);
    }
}
