package com.veltronik.v2.core.dto;

import com.veltronik.v2.core.entities.DeviceRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Cuerpo del bautizo de un equipo (Fase 1, ladrillo 2 — POST /api/core/devices/enroll). */
@Data
public class DeviceEnrollRequest {

    @NotNull(message = "Elegí el rol del equipo (CAJA o ENCARGADO)")
    private DeviceRole role;

    @NotBlank(message = "Poné un nombre visible para el equipo (ej: Caja mostrador)")
    @Size(max = 120, message = "El nombre no puede superar los 120 caracteres")
    private String displayName;

    /** Reemplazo explícito de una Caja Madre activa — nunca se pisa en silencio. */
    private boolean replaceActiveManager = false;
}
