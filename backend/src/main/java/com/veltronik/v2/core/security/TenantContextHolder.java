package com.veltronik.v2.core.security;

import java.util.UUID;

/**
 * Almacena el ID del Tenant (Negocio) en el hilo actual de ejecución (ThreadLocal).
 * Esto permite que cualquier capa de la aplicación (especialmente Hibernate)
 * sepa para qué Tenant se están ejecutando las consultas sin pasarlo por parámetro.
 */
public class TenantContextHolder {

    private static final ThreadLocal<UUID> CONTEXT = new ThreadLocal<>();

    public static void setTenantId(UUID tenantId) {
        CONTEXT.set(tenantId);
    }

    public static UUID getTenantId() {
        return CONTEXT.get();
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
