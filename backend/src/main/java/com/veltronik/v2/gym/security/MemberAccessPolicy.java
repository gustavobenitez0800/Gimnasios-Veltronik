package com.veltronik.v2.gym.security;

import com.veltronik.v2.gym.entities.GymMember;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * ¿Este socio está al día? La <b>única fuente de verdad</b> de la situación de un socio frente
 * a su cuota.
 *
 * <p><b>Por qué existe:</b> hasta ahora la comparación {@code membershipEnd} contra "hoy" estaba
 * repartida por el frontend y por varias consultas, cada una con su propio criterio de qué
 * significa "vencido". Cuando el QR de la puerta empezó a tener que dar un veredicto en voz
 * alta, esa dispersión pasó de ser fea a ser peligrosa: dos pantallas podían decirle cosas
 * distintas a la misma persona.</p>
 *
 * <p>Es hermana de {@link com.veltronik.v2.core.security.SubscriptionAccessPolicy}, pero
 * responden preguntas de pisos distintos: aquella dice si <b>el gimnasio</b> le paga a
 * Veltronik; esta dice si <b>el socio</b> le paga al gimnasio. No hay que mezclarlas.</p>
 *
 * <p><b>Esta clase no decide si la puerta se abre.</b> Solo informa. Qué hacer con un vencido
 * —dejarlo pasar, avisar al mostrador, hacer sonar el teléfono— es una decisión del negocio y
 * vive en el servicio, no acá. Hoy esa decisión es: <i>suena, avisa, y entra igual</i>, porque
 * el dueño prefiere la conversación antes que perder al socio en la puerta.</p>
 */
@Component
public class MemberAccessPolicy {

    /** En qué situación está el socio cuando marca. */
    public enum Status {
        /** Cuota vigente. */
        AL_DIA,
        /** Se le venció hace poco: entra, pero el mostrador se entera. */
        EN_GRACIA,
        /** Vencido más allá de la gracia. */
        VENCIDO,
        /** Sin fecha de vencimiento cargada — dato incompleto, no es lo mismo que deber. */
        SIN_DATOS,
        /** Dado de baja por el gimnasio. No es un problema de plata. */
        INACTIVO
    }

    public record Verdict(Status status, LocalDateTime membershipEnd, long diasVencido) {
        /** ¿Le mostramos algo distinto a "pasá"? */
        public boolean necesitaAviso() {
            return status != Status.AL_DIA;
        }
    }

    private final int graceDays;

    public MemberAccessPolicy(@Value("${veltronik.gym.access.grace-days:3}") int graceDays) {
        this.graceDays = graceDays;
    }

    public int getGraceDays() {
        return graceDays;
    }

    /**
     * Evalúa la situación del socio en el instante {@code now}.
     *
     * <p><b>Un socio sin fecha de vencimiento NO es un moroso.</b> Es un dato que falta —pasa con
     * los que se migraron o se cargaron a las apuradas— y tratarlo como deudor haría sonar la
     * alarma en la cara de alguien que está al día. Se marca aparte para que el mostrador lo
     * complete, no para acusarlo.</p>
     */
    public Verdict evaluate(GymMember member, LocalDateTime now) {
        if (member == null) return new Verdict(Status.INACTIVO, null, 0);

        // La baja manda sobre todo lo demás: el que fue dado de baja no "debe", ya no es socio.
        if (!member.isActive()) {
            return new Verdict(Status.INACTIVO, member.getMembershipEnd(), 0);
        }

        LocalDateTime end = member.getMembershipEnd();
        if (end == null) {
            return new Verdict(Status.SIN_DATOS, null, 0);
        }

        if (end.isAfter(now)) {
            return new Verdict(Status.AL_DIA, end, 0);
        }

        long dias = java.time.Duration.between(end, now).toDays();
        Status s = dias <= graceDays ? Status.EN_GRACIA : Status.VENCIDO;
        return new Verdict(s, end, dias);
    }
}
