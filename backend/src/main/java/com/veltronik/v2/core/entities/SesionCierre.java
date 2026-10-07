package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Por qué se cerró una sesión de un terminal (V89). Diagnóstico, no dato del negocio.
 *
 * <p>No cuelga de nada a propósito: ni del usuario ni de la sucursal que nombra. Tiene que
 * poder anotarse aunque ya no existan, y borrarlos no puede frenarse por un renglón de esto.</p>
 */
@Getter
@Setter
@Entity
@Table(name = "sesion_cierre")
public class SesionCierre extends BaseEntity {

    /** El sello que le puso el terminal. Único: el mismo aviso no entra dos veces. */
    @Column(name = "client_ref", nullable = false, updatable = false)
    private UUID clientRef;

    /** Cuándo pasó, según el terminal y acotado por el servidor (ver SesionCierreService). */
    @Column(name = "ocurrido_at", nullable = false)
    private LocalDateTime ocurridoAt;

    @Column(name = "motivo", nullable = false, length = 40)
    private String motivo;

    @Column(name = "detalle", length = 500)
    private String detalle;

    /** De quién era la sesión que se cerró. Lo DICE el terminal: no se verifica. */
    @Column(name = "user_id")
    private UUID userId;

    /** Quién estaba adentro cuando llegó el aviso. Este sí sale del token. */
    @Column(name = "reportado_por", nullable = false)
    private UUID reportadoPor;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "device_id")
    private UUID deviceId;

    @Column(name = "app_version", length = 32)
    private String appVersion;

    /** "escritorio" o "web". */
    @Column(name = "plataforma", length = 20)
    private String plataforma;
}
