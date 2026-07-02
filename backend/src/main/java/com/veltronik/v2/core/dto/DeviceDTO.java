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

    /** Nombre visible que le puso el dueño (null si no está enrolado). */
    private String displayName;

    /** CAJA | ENCARGADO (null si no está enrolado). */
    private String role;

    /** ACTIVE | REVOKED (null si nunca fue enrolado). */
    private String status;
}
