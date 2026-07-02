package com.veltronik.v2.core.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Equipo del registro, para el listado del dueño (Fase 1, ladrillo 1). */
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
}
