package com.veltronik.v2.core.security;

import java.util.UUID;

/**
 * Almacena el "DNI de equipo" (id de la instalación que origina la request) en el hilo
 * actual (ThreadLocal), espejo de {@link TenantContextHolder}.
 *
 * <p><b>Qué es el DNI de equipo (ADR-002):</b> un identificador físico inmutable de cada
 * instalación, que se estampa en cada registro operativo ({@code origin_device_id}). La
 * sucursal asignada a un equipo es una etiqueta reasignable; el DNI nunca miente — por eso
 * cualquier error de enrolamiento se repara re-etiquetando datos sin perder nada.</p>
 *
 * <p><b>No es un dato de seguridad:</b> es procedencia/trazabilidad. Puede ser nulo
 * (requests de la web, jobs internos, webhooks). Nunca se usa para autorizar.</p>
 */
public class DeviceContextHolder {

    private static final ThreadLocal<UUID> CONTEXT = new ThreadLocal<>();

    public static void setDeviceId(UUID deviceId) {
        CONTEXT.set(deviceId);
    }

    public static UUID getDeviceId() {
        return CONTEXT.get();
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
