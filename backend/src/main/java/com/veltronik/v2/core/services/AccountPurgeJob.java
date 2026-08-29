package com.veltronik.v2.core.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Borra definitivamente las cuentas cuya gracia de 30 días ya venció.
 *
 * <p>Corre a las 03:00, lejos de cualquier hora de gimnasio. No es por carga —son pocas filas—
 * sino porque es la operación irreversible del sistema: si algo sale mal, conviene que sea a
 * una hora en la que nadie está trabajando y quede el log entero para leer a la mañana.</p>
 *
 * <p>Va separado del servicio a propósito: el servicio sabe CÓMO borrar, este sabe CUÁNDO. Así
 * la purga se puede disparar a mano —desde un test, o si un día hay que forzarla— sin depender
 * del reloj.</p>
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class AccountPurgeJob {

    private final AccountDeletionService deletionService;

    @Scheduled(cron = "0 0 3 * * ?", zone = "America/Argentina/Buenos_Aires")
    public void purgar() {
        try {
            deletionService.purgarVencidas();
        } catch (Exception e) {
            // Que falle la purga no puede tumbar nada: son datos que ya nadie usa y mañana se
            // reintenta. Lo grave sería lo contrario —borrar de más— y eso no lo arregla un
            // reintento.
            log.error("La purga de cuentas falló entera. Se reintenta mañana.", e);
        }
    }
}
