package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.config.Escala;
import com.veltronik.v2.core.security.FrenoPorMinuto;
import com.veltronik.v2.gym.services.MolineteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Donde el molinete avisa cada reconocimiento. <b>Endpoint público sin login</b>: el que llama
 * es un aparato colgado en la pared de un gimnasio, sin sesión y sin manera de tener una.
 *
 * <p>Vive bajo {@code /api/public/**}, que es {@code permitAll} y está fuera del KillSwitch,
 * igual que el check-in por QR.</p>
 *
 * <p><b>El token va en la RUTA, no en la query.</b> El equipo arma la URL del aviso pegándole
 * sus propios parámetros a la dirección que le configuramos, así que un token en la query
 * quedaría mezclado con los suyos y a merced de cómo los concatene. En la ruta no lo toca
 * nadie. Es el mismo token del punto de acceso que usa el cartel del QR: opaco, rotable, y
 * resuelve solo a qué gimnasio pertenece la puerta.</p>
 *
 * <p><b>Qué se le contesta al equipo y por qué importa.</b> El equipo guarda lo que no pudo
 * entregar y lo reintenta cuando vuelve la conexión. Entonces: 200 cuando lo procesamos
 * <i>y también</i> cuando el aviso no tiene arreglo (token que no existe, socio que ya no
 * está) — reintentarlo mil veces no lo va a mejorar. El error 500 se reserva para las fallas
 * nuestras, que son las únicas donde reintentar sirve.</p>
 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
@Slf4j
public class PublicMolineteController {

    private final MolineteService molineteService;

    /**
     * Tope de avisos por minuto <b>y por copia del backend</b>, no por puerta.
     *
     * <p>Alto a propósito: el equipo avisa por reconocimiento, no por persona, y manda varios
     * por segundo mientras haya una cara enfrente. 300 por minuto es muchísimo más de lo que
     * genera una puerta real en hora pico, y sigue siendo una pared para cualquier otra cosa.</p>
     *
     * <p><b>El número no es el que aplica la puerta.</b> El contador vive en memoria y cada
     * copia del backend lleva el suyo, así que con {@link Escala#MAX_INSTANCIAS} copias el
     * techo real está entre 300 y 900 avisos por minuto según cómo Cloud Run reparta. No se
     * corrige con un contador compartido porque no vale la pena: contra un molinete que en
     * hora pico genera unos pocos avisos por segundo, 300 y 900 son igual de holgados.</p>
     */
    private static final int MAX_AVISOS_POR_MINUTO_POR_INSTANCIA = 300;

    /** Con techo de memoria: ver por qué en {@link FrenoPorMinuto}. */
    private final FrenoPorMinuto frenos = new FrenoPorMinuto();

    @PostMapping("/molinete/{token}")
    public ResponseEntity<?> aviso(@PathVariable String token,
                                   @RequestParam Map<String, String> query,
                                   @RequestBody(required = false) Map<String, Object> body) {
        // Más largo que cualquier token nuestro: es un aviso sin arreglo, y como tal se contesta
        // 200 (que el equipo no lo reintente), sin tocar el freno, la base ni los registros.
        if (token.length() > FrenoPorMinuto.MAX_LARGO_CLAVE) {
            return ResponseEntity.ok(Map.of("result", 1, "success", true,
                    "estado", MolineteService.Resultado.NO_AUTORIZADO.name()));
        }
        if (frenado(token)) {
            log.warn("Molinete frenado: esta copia llegó a los {} avisos del minuto. El tope es POR COPIA y hay hasta {} (token …{}).",
                    MAX_AVISOS_POR_MINUTO_POR_INSTANCIA, Escala.MAX_INSTANCIAS, cola(token));
            return ResponseEntity.status(429).body(Map.of("result", 0, "success", false));
        }

        // El equipo manda lo mismo dos veces: como query string y como JSON en el cuerpo. Se
        // prefiere el cuerpo, que es el que documenta el fabricante, y la query queda de
        // respaldo por si un firmware manda uno solo.
        MolineteService.Aviso aviso = new MolineteService.Aviso(
                campo(body, query, "personId"),
                campo(body, query, "deviceKey"),
                campo(body, query, "type"),
                campo(body, query, "time"),
                campo(body, query, "passTimeType"));

        MolineteService.Resultado r;
        try {
            r = molineteService.recibir(token, aviso);
        } catch (RuntimeException e) {
            // Falla nuestra: que el equipo lo guarde y lo mande de nuevo. Es el único caso
            // donde reintentar arregla algo.
            log.error("No se pudo procesar el aviso del molinete (token …{}).", cola(token), e);
            return ResponseEntity.status(500).body(Map.of("result", 0, "success", false));
        }

        registrarAviso(token);
        if (r != MolineteService.Resultado.REGISTRADO && r != MolineteService.Resultado.REPETIDO) {
            log.info("Aviso de molinete: {} (puerta …{}).", r, cola(token));
        }
        return ResponseEntity.ok(Map.of("result", 1, "success", true, "estado", r.name()));
    }

    /** Lee un campo del cuerpo y, si no está, de la query. Todo llega como texto. */
    private static String campo(Map<String, Object> body, Map<String, String> query, String nombre) {
        Object v = body == null ? null : body.get(nombre);
        if (v != null && !v.toString().isBlank()) return v.toString();
        return query.get(nombre);
    }

    private boolean frenado(String token) {
        // Acá no hay tope de fallos: el equipo no "falla", avisa lo que vio.
        return frenos.frenado(token, MAX_AVISOS_POR_MINUTO_POR_INSTANCIA, Integer.MAX_VALUE);
    }

    private void registrarAviso(String token) {
        frenos.registrar(token, false);
    }

    /** Últimos caracteres del token, para rastrear en los logs sin publicarlo entero. */
    private static String cola(String token) {
        return token.length() <= 6 ? "?" : token.substring(token.length() - 6);
    }
}
