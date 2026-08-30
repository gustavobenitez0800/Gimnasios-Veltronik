package com.veltronik.v2.gym.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "access_log")
public class AccessLog extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "member_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymMember member;

    @Column(name = "check_in_at", nullable = false)
    private LocalDateTime checkInAt;

    @Column(name = "check_out_at")
    private LocalDateTime checkOutAt;

    @Column(name = "access_method", length = 50)
    private String accessMethod = "MANUAL";

    /**
     * La visita la cerró el sistema, no el socio (V47).
     *
     * <p>El caso más común de todos: entra, marca, y se va sin volver a marcar. El socio VINO
     * —eso es cierto y cuenta como asistencia— pero <b>no sabemos cuándo se fue</b>.</p>
     *
     * <p><b>Contrato:</b> toda cuenta de <i>permanencia</i> (cuánto se quedan, promedio de
     * duración) tiene que excluir las visitas con esta marca. Si no, el promedio se llena de
     * visitas inventadas. Las cuentas de <i>asistencia</i> (cuántos vinieron, hora pico, vino
     * este mes) las incluyen sin problema: esas miran la entrada, que sí es real.</p>
     */
    @Column(name = "auto_closed", nullable = false)
    private boolean autoClosed = false;

    /** Por qué puerta entró. Null en los accesos cargados a mano por el mostrador. */
    @Column(name = "checkin_point_id")
    private java.util.UUID checkinPointId;

    /**
     * Desde qué teléfono se marcó (V49). Número al azar que el propio teléfono se genera y
     * guarda: NO sale de ningún dato del aparato ni de la persona.
     *
     * <p>Existe para una sola pregunta: <i>¿este mismo teléfono viene marcando a nombre de
     * personas distintas?</i> Como el check-in se identifica con el DNI —que no es secreto—
     * cualquiera podría marcar por otro. Cerrarlo del todo exigiría un PIN por socio; la
     * decisión fue no agregar fricción pero dejar rastro, y este campo es ese rastro.</p>
     *
     * <p>Null en los accesos que carga el mostrador a mano: ahí no hay teléfono detrás.</p>
     */
    @Column(name = "scanner_id")
    private java.util.UUID scannerId;

    /**
     * Cuándo el mostrador dio por atendido el aviso de este acceso (V51).
     *
     * <p>Null = todavía está en la lista. Sin esta marca, el aviso de las 9 de la mañana
     * seguiría en pantalla a las 8 de la noche, y un cartel que no se puede sacar deja de
     * leerse a los dos días — llevándose puestos los avisos que sí importaban.</p>
     *
     * <p>Vive acá y no en cada terminal a propósito: si el gimnasio tiene dos computadoras,
     * que una recepcionista resuelva el caso tiene que apagar el aviso en las dos.</p>
     */
    @Column(name = "aviso_visto_at")
    private LocalDateTime avisoVistoAt;

    @Column(columnDefinition = "text")
    private String notes;
}
