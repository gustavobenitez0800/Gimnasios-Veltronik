package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.DeviceContextHolder;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * ⭐ Donde un terminal avisa que su cola está trabada: que el servidor le viene rechazando lo
 * que tiene para subir.
 *
 * <p><b>Por qué existe (Santo Sport, 05/10/2026).</b> Un alta que el servidor contestaba con
 * 500 dejó detrás 139 entradas, cobros y el cierre de caja durante 36 horas. El terminal lo
 * sabía —reintentó 288 veces— y del lado del servidor cada rechazo era una línea más en un
 * registro que nadie mira. El que avisó fue el dueño del gimnasio, por WhatsApp, después de
 * llamar al técnico del router. Esto es para enterarse antes que él.</p>
 *
 * <p><b>Solo deja una línea de ERROR, con una marca fija</b> ({@link #MARCA}). No guarda nada:
 * la alerta se arma sobre el registro del servidor, que es donde ya caen los demás errores, y
 * así no hace falta una tabla para algo que —si todo anda— no pasa nunca.</p>
 *
 * <p>Va bajo {@code /api/account} por lo mismo que el aviso de cierre de sesión:
 * {@code KillSwitchFilter} no bloquea este prefijo, y un terminal con la cola trabada tiene que
 * poder decirlo aunque el gimnasio esté con la suscripción vencida.</p>
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
@Slf4j
public class ColaTrabadaController {

    /** La marca que busca la alerta. Si cambia acá, hay que cambiarla en la alerta. */
    public static final String MARCA = "COLA TRABADA";

    private final TenantRepository tenantRepository;

    /**
     * Lo que cuenta el terminal. <b>Todo texto, a propósito:</b> es un aviso de que algo anda
     * mal, y rechazarlo con 400 porque un número llegó raro sería perder justo el aviso.
     *
     * @param cuantos  cuántos movimientos esperan
     * @param desde    el momento del más viejo, en hora del terminal
     * @param tipo     qué es el de adelante (ALTA, COBRO, ACCESO…), que es el que traba
     * @param status   con qué código lo viene rechazando el servidor
     * @param intentos cuántas veces lo intentó
     * @param error    lo último que le contestaron
     */
    public record Aviso(String cuantos, String desde, String tipo, String status, String intentos, String error) {}

    @PostMapping("/cola-trabada")
    public ResponseEntity<Void> avisar(@RequestBody(required = false) Aviso aviso,
                                       @RequestHeader(value = "X-App-Version", required = false) String appVersion) {
        if (SecurityUtils.getCurrentUserId() == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        UUID gimnasio = TenantContextHolder.getTenantId();
        String nombre = gimnasio == null ? "sin sucursal"
                : tenantRepository.findById(gimnasio).map(Tenant::getName).orElse("desconocido");
        Aviso a = aviso == null ? new Aviso(null, null, null, null, null, null) : aviso;

        log.error("{} · gimnasio '{}' ({}) · equipo {} · v{} · {} movimientos esperando desde {} · "
                        + "el primero es {} y el servidor le contesta {} (van {} intentos): {}",
                MARCA, limpio(nombre, 80), gimnasio, DeviceContextHolder.getDeviceId(), limpio(appVersion, 20),
                limpio(a.cuantos(), 8), limpio(a.desde(), 30), limpio(a.tipo(), 20),
                limpio(a.status(), 8), limpio(a.intentos(), 8), limpio(a.error(), 300));
        return ResponseEntity.noContent().build();
    }

    /**
     * Texto que viene de afuera, listo para ir a un registro: en una sola línea y con tope.
     * Sin esto, un salto de línea en el mensaje permitiría escribir líneas de registro falsas.
     */
    private static String limpio(String texto, int tope) {
        if (texto == null || texto.isBlank()) return "?";
        String unaLinea = texto.replaceAll("[\\r\\n\\t]+", " ").trim();
        return unaLinea.length() <= tope ? unaLinea : unaLinea.substring(0, tope) + "…";
    }
}
