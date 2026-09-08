package com.veltronik.v2.gym.services;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * ⚠️ EL RELOJ DEL TERMINAL NO SE CREE, SE ACOTA.
 *
 * <p>Todo lo que se registra sin internet viaja con el momento en que PASÓ, puesto por el
 * terminal. Esa fecha no es un dato de adorno: decide en qué día cuenta un acceso, en qué
 * arqueo cae un egreso, y por lo tanto si el cierre de anoche dice faltante o cuadra.</p>
 *
 * <p>Y la máquina de un mostrador puede tener la hora mal <b>por meses</b> — nadie la mira.</p>
 *
 * <p><b>Por qué esta clase existe en vez de estar escrita dos veces.</b> Nació privada dentro
 * de {@code AccessLogService}, para los accesos. Cuando los egresos necesitaron exactamente
 * la misma regla, copiarla habría sido la cuarta vez que este proyecto duplica una cuenta de
 * fechas — y las tres anteriores terminaron con las copias diciendo números distintos para el
 * mismo hecho. Si esta regla cambia, cambia en un solo lugar.</p>
 *
 * <p><b>⛔ PARA QUÉ NO SIRVE.</b> Esto acota un momento DECLARADO POR EL TERMINAL sobre algo
 * que acaba de pasar. No sirve para una fecha que ELIGIÓ UNA PERSONA: el portal deja cargar
 * un pago hecho la semana pasada, y acotarlo a 36 horas convertiría ese pago en uno de
 * anteayer sin avisarle a nadie. Fecha elegida a mano: no pasa por acá.</p>
 */
public final class MomentoDeclarado {

    /** La zona del negocio. La base responde en la suya y el hecho caería fuera del período. */
    public static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    /**
     * Cuánto atraso se acepta como creíble.
     *
     * <p>Un corte de internet de un día y medio es creíble; uno de tres meses es un reloj
     * roto, y meter ese movimiento en marzo ensuciaría un período que ya se cerró.</p>
     */
    public static final int ATRASO_MAXIMO_HORAS = 36;

    private MomentoDeclarado() {
    }

    /** El momento declarado, puesto en su lugar contra el reloj del servidor. */
    public static LocalDateTime acotar(LocalDateTime declarado) {
        return acotar(declarado, LocalDateTime.now(BUSINESS_ZONE));
    }

    /**
     * Igual, con el "ahora" dado.
     *
     * <p>La sobrecarga existe para poder probar los bordes sin tocar el reloj de la máquina:
     * un test que depende de la hora real falla de madrugada, y en este proyecto ya pasó.</p>
     *
     * <ul>
     *   <li><b>Sin declarar</b> → ahora. Es el camino con internet, que no manda momento.</li>
     *   <li><b>En el futuro</b> → ahora. Todavía no pasó; aceptarlo dejaría el hecho fuera de
     *       todo período hasta que el reloj del servidor lo alcance.</li>
     *   <li><b>Más viejo que el límite</b> → el límite. Se acota en vez de rechazar a
     *       propósito: <b>el hecho pasó</b>. Alguien entró al gimnasio, o salió plata del
     *       cajón. Perderlo por no confiar en un reloj es peor que guardarlo corrido.</li>
     * </ul>
     */
    public static LocalDateTime acotar(LocalDateTime declarado, LocalDateTime ahora) {
        if (declarado == null) return ahora;
        if (declarado.isAfter(ahora)) return ahora;
        LocalDateTime masViejoAceptable = ahora.minusHours(ATRASO_MAXIMO_HORAS);
        return declarado.isBefore(masViejoAceptable) ? masViejoAceptable : declarado;
    }
}
