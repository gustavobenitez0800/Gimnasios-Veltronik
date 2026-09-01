package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Contrato de ENTRADA para registrar un acceso (toggle check-in / check-out).
 * Reemplaza el {@code Map<String,Object>} sin tipar del controller. El frontend
 * ya envía {@code memberId} y {@code method}.
 */
@Data
public class AccessRegisterInputDTO {
    private UUID memberId;
    private String method;

    /**
     * Identificador que genera el terminal. Presente solo cuando el acceso pasó por la cola
     * de sin-conexión. Si el servidor ya lo vio, devuelve el acceso que guardó la primera
     * vez y no hace nada más.
     */
    private UUID clientRef;

    /**
     * CUÁNDO pasó de verdad, según el reloj del terminal.
     *
     * <p>Sin esto, un acceso que ocurrió a las 10:00 y llega a las 10:45 se evaluaría contra
     * el estado de las 10:45, y la dirección —entrada o salida— saldría al revés. La
     * dirección no es un dato del pedido: es una consecuencia del momento.</p>
     *
     * <p>Ausente en los accesos online, donde "ahora" es ahora.</p>
     */
    private LocalDateTime ocurridoEn;
}
