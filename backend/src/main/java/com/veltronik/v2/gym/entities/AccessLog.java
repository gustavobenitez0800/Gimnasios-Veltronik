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

    @Column(columnDefinition = "text")
    private String notes;
}
