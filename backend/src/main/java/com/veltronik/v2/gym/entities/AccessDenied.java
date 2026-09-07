package com.veltronik.v2.gym.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Un socio que quiso entrar por el molinete y no pudo (V64).
 *
 * <p><b>No es una visita, y por eso no vive en {@link AccessLog}.</b> Esa persona no entró al
 * gimnasio. Guardarlo junto a las visitas obligaría a que toda cuenta de asistencia se acuerde
 * de filtrarlo —el tablero, los reportes, "quién está adentro", "¿vino este socio este mes?"—
 * y alcanza con que una se olvide para que el sistema empiece a contar como presente a alguien
 * que se quedó en la vereda.</p>
 *
 * <p><b>Para qué sirve entonces:</b> es la lista de a quién llamar. El molinete le dijo que no
 * en la cara y se fue; si el mostrador no se entera, el gimnasio pierde al socio sin haber
 * hablado con él nunca.</p>
 *
 * <p>Solo se guarda cuando el equipo <b>reconoció</b> a la persona. Un desconocido parado
 * frente a la cámara no es un socio con un problema de cuota: es alguien que pasó por ahí.</p>
 */
@Getter
@Setter
@Entity
@Table(name = "access_denied")
public class AccessDenied extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "member_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymMember member;

    /** Cuándo pasó, con el reloj del equipo ya acotado por el servidor. */
    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    /** Por qué no pasó, en el vocabulario del equipo. Ver {@link Reason}. */
    @Column(name = "reason", nullable = false, length = 40)
    private String reason;

    @Column(name = "checkin_point_id")
    private UUID checkinPointId;

    /** Número de serie del equipo que lo frenó. Para el dueño con más de una entrada. */
    @Column(name = "device_serial", length = 64)
    private String deviceSerial;

    /** El mostrador ya lo habló con el socio: se saca de la lista. */
    @Column(name = "aviso_visto_at")
    private LocalDateTime avisoVistoAt;

    /**
     * Los motivos que sabe informar el equipo.
     *
     * <p>Es lo que el molinete dice, no lo que Veltronik concluye: el estado real del socio se
     * recalcula al mostrarlo, porque puede haber pagado entre que lo frenaron y que alguien
     * mire la lista.</p>
     */
    public static final class Reason {
        /** Le cerramos el horario porque está vencido: el equipo lo reconoce y no le abre. */
        public static final String FUERA_DE_HORARIO = "FUERA_DE_HORARIO";
        /** El equipo lo reconoció pero no tiene habilitado ese método de verificación. */
        public static final String SIN_PERMISO = "SIN_PERMISO";

        private Reason() {}
    }
}
