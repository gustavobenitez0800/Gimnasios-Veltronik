package com.veltronik.v2.core.exceptions;

import com.veltronik.v2.core.entities.Device;
import lombok.Getter;

/**
 * La sucursal ya tiene un ENCARGADO activo y el enrolamiento no pidió reemplazarlo
 * (Fase 1, ladrillo 2 — integridad "un encargado activo por sucursal", ADR-002 punto 5
 * del bautizo). El controller la mapea a HTTP 409 con los datos del equipo en conflicto,
 * para que la UI pueda preguntar: ¿reemplazo o error?
 */
@Getter
public class DeviceEnrollConflictException extends RuntimeException {

    private final transient Device conflictingDevice;

    public DeviceEnrollConflictException(Device conflictingDevice) {
        super("La sucursal ya tiene una Caja Madre activa.");
        this.conflictingDevice = conflictingDevice;
    }
}
