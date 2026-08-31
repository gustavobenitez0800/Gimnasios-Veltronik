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
        INACTIVO,
        /**
         * Se le acabaron las clases del abono, aunque la fecha siga vigente.
         *
         * <p>Es distinto de VENCIDO a propósito: el socio <b>está al día con la plata</b>, lo que
         * agotó es el cupo de visitas que compró. Decirle "vencido" a alguien que pagó sería
         * mandarlo a discutir una deuda que no tiene.</p>
         */
        SIN_CLASES
    }

    /**
     * @param clasesRestantes visitas que le quedan. <b>NULL = este gimnasio no cuenta clases</b>,
     *                        y entonces la cobertura la decide solo la fecha.
     */
    public record Verdict(Status status, LocalDateTime membershipEnd, long diasVencido,
                          long diasRestantes, Integer clasesRestantes) {
        /** ¿Le mostramos algo distinto a "pasá"? */
        public boolean necesitaAviso() {
            return status != Status.AL_DIA;
        }

        /** ¿Este socio lleva cupo de clases? */
        public boolean usaClases() {
            return clasesRestantes != null;
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
        if (member == null) return new Verdict(Status.INACTIVO, null, 0, 0, null);

        final Integer clases = member.getClassesRemaining();

        // La baja manda sobre todo lo demás: el que fue dado de baja no "debe", ya no es socio.
        if (!member.isActive()) {
            return new Verdict(Status.INACTIVO, member.getMembershipEnd(), 0, 0, clases);
        }

        LocalDateTime end = member.getMembershipEnd();
        if (end == null) {
            return new Verdict(Status.SIN_DATOS, null, 0, 0, clases);
        }

        if (end.isAfter(now)) {
            // Se redondea HACIA ARRIBA: al que le quedan 12 horas le faltan "1 día", no cero.
            // Decirle "0 días" a alguien que todavía puede entrenar hoy es alarmarlo de más.
            long faltan = (long) Math.ceil(java.time.Duration.between(now, end).toMinutes() / 1440.0);

            // ── LA COBERTURA SE AGOTA POR LO QUE PASE PRIMERO ──
            //
            // Un abono de "1 mes / 12 clases" cubre un mes, o doce visitas: lo que termine
            // antes. Si solo mirásemos la fecha, el que compró 12 visitas podría venir 30
            // veces — y el gimnasio le cobra distinto justamente por eso.
            //
            // ⚠️ NULL no es 0. NULL es "acá no se cuentan clases" y no cambia nada; 0 es "se
            // le acabaron". Confundirlos dejaría sin entrar a todos los socios de todos los
            // gimnasios que no usan esta función.
            if (clases != null && clases <= 0) {
                return new Verdict(Status.SIN_CLASES, end, 0, Math.max(1, faltan), clases);
            }

            return new Verdict(Status.AL_DIA, end, 0, Math.max(1, faltan), clases);
        }

        // Vencido por fecha. Las clases que le sobren NO lo rescatan: el período que compró
        // terminó. (Esa confusión —tomar las clases sin usar como si fueran crédito vigente—
        // es la que hizo aparecer al día a gente que no pagaba desde hacía meses.)
        long dias = java.time.Duration.between(end, now).toDays();
        Status s = dias <= graceDays ? Status.EN_GRACIA : Status.VENCIDO;
        return new Verdict(s, end, dias, 0, clases);
    }
}
