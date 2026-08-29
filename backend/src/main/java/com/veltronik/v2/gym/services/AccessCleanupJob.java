package com.veltronik.v2.gym.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Cierra todas las noches las visitas que quedaron abiertas.
 *
 * <p><b>Por qué hace falta si el escaneo ya se fija.</b> Al marcar, el sistema detecta si el
 * socio dejó una visita abierta y la cierra. Pero eso solo pasa <b>cuando el socio vuelve</b>.
 * El que se fue sin marcar y no vuelve —se dio de baja, se mudó, se peleó con el gimnasio—
 * quedaría "adentro" para siempre. Sin este trabajo, el contador de gente adentro solo sube, y
 * a los tres meses el gimnasio muestra cuarenta personas entrenando a las cuatro de la mañana.
 * Un número así no se corrige: se deja de mirar, y con él se cae la confianza en todo lo demás.</p>
 *
 * <p>Corre a las 00:15 hora de Argentina, después del cierre de suscripciones (00:05) para no
 * pelear con él por la base en el mismo minuto.</p>
 *
 * <p>Sin contexto de gimnasio a propósito: el filtro por tenant solo se activa cuando hay uno en
 * la sesión, así que desde el cron la consulta ve todos los negocios. Es exactamente lo que hace
 * falta —hay que cerrar las visitas de todos— y es deliberado, no un descuido.</p>
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class AccessCleanupJob {

    private final AccessLogService accessLogService;

    @Scheduled(cron = "0 15 0 * * ?", zone = "America/Argentina/Buenos_Aires")
    public void cerrarVisitasDeAyer() {
        try {
            int cerradas = accessLogService.cerrarVisitasAbandonadas();
            if (cerradas > 0) {
                log.info("Cierre nocturno: {} visitas quedaron abiertas de días anteriores y se cerraron.", cerradas);
            }
        } catch (Exception e) {
            // Que falle el cierre no puede tumbar nada más: es higiene de datos, no una operación
            // de la que dependa nadie en este momento. Mañana vuelve a intentarlo.
            log.error("Cierre nocturno de visitas falló. Se reintenta mañana.", e);
        }
    }
}
