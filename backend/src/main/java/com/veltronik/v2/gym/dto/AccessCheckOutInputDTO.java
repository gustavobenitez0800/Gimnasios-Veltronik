package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * Contrato de ENTRADA para marcar la salida de una visita.
 *
 * <p>El cuerpo es opcional: el camino con internet no manda nada y el servidor sella con su
 * propio reloj, que es el confiable.</p>
 */
@Data
public class AccessCheckOutInputDTO {

    /**
     * CUÁNDO se fue de verdad, según el reloj del terminal.
     *
     * <p>Presente solo cuando la salida pasó por la cola de sin-conexión. Una salida guardada
     * a las 20:00 que sube a las 09:00 del día siguiente, sellada con la hora del servidor,
     * dejaría una visita de trece horas — y la permanencia es justo el número con el que el
     * dueño decide cosas. Se acota contra el reloj del servidor: el de un mostrador puede
     * estar mal por meses.</p>
     */
    private LocalDateTime ocurridoEn;
}
