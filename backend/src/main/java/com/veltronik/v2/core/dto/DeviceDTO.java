package com.veltronik.v2.core.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Equipo del registro, para el listado del dueño (Fase 1, ladrillos 1 y 2). */
@Data
public class DeviceDTO {

    /** El DNI del equipo. */
    private UUID id;

    /** Versión de la app en la última señal de vida (base del rollout por anillos). */
    private String lastAppVersion;

    /** Última señal de vida (granularidad ~5 min por el throttle). */
    private LocalDateTime lastSeenAt;

    /** Primera vez visto. */
    private LocalDateTime firstSeenAt;

    // ── Enrolamiento (ladrillo 2) ──

    /** ¿Está enrolado y ACTIVO en la sucursal en curso? */
    private boolean enrolled;

    /**
     * Sucursal a la que está atado el equipo, sin importar cuál sea la sucursal en curso
     * (Fase 3). {@link #enrolled} no alcanza para el arranque de la app de escritorio:
     * es relativo al tenant de la request, y en el arranque justamente todavía no hay
     * ninguno — la app pregunta "¿a qué sucursal pertenezco?" para no tener que mostrar
     * un selector. Null = equipo sin enrolar.
     */
    private UUID enrolledTenantId;

    /** Nombre de esa sucursal, para poder mostrarlo sin una segunda request. */
    private String enrolledTenantName;

    /** Nombre visible que le puso el dueño (null si no está enrolado). */
    private String displayName;

    /** CAJA | ENCARGADO (null si no está enrolado). */
    private String role;

    /** ACTIVE | REVOKED (null si nunca fue enrolado). */
    private String status;

    /** Última vez que el equipo empujó datos por sync (frescura honesta; ladrillo 7). */
    private LocalDateTime lastSyncAt;

    /** Anillo de update: 0=piloto, 1=amigos, 2=todos. Null=todos (ladrillo 7). */
    private Short updateRing;
}
