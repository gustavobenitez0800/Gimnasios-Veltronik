package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Un socio que <b>pagó más allá de la fecha hasta la que figura cubierto</b>.
 *
 * <p>Son los restos del bug que se arregló en {@code GymPaymentService}: el pago se
 * guardaba y la segunda request —la que le corría el vencimiento al socio— fallaba en
 * silencio. El socio quedaba figurando vencido con la plata ya cobrada.</p>
 *
 * <p>Arreglar el mecanismo no corrige hacia atrás, así que esto es la lista para que el
 * dueño la mire y decida socio por socio. <b>Nunca se corrige solo:</b> son fechas de
 * membresía de gente real, y equivocarse regala o saca meses de servicio.</p>
 */
@Data
public class CoverageGapDTO {

    private UUID memberId;

    /** Nombre completo, para que el dueño reconozca de quién habla la fila. */
    private String memberName;

    /** Hasta cuándo figura cubierto hoy. Null = nunca tuvo fecha. */
    private LocalDateTime membershipEnd;

    /** Hasta cuándo pagó realmente (el período más lejano entre sus pagos cobrados). */
    private LocalDateTime paidUntil;

    /** Cuántos días de servicio se le deben. Lo calcula el backend para no repetirlo en la UI. */
    private long daysOwed;
}
