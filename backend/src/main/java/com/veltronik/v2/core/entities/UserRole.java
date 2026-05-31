package com.veltronik.v2.core.entities;

/**
 * Roles de usuario dentro de un Tenant.
 *
 * - {@code OWNER}: Dueño del negocio. Acceso total.
 * - {@code ADMIN}: Administrador. Gestión operativa completa.
 * - {@code STAFF}: Empleado. Acceso limitado a operaciones del día a día.
 */
public enum UserRole {
    OWNER,
    ADMIN,
    STAFF,
    RECEPTION
}
