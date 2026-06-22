package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.UserRole;

import java.util.HashSet;
import java.util.Set;

/**
 * Política de VISIBILIDAD de módulos por rol — la fuente única de "qué dibuja el front".
 *
 * <p>Hasta ahora esta política vivía DUPLICADA en el frontend (el filtrado por rol del
 * Sidebar, comentado como "espejo de @PreAuthorize"). Ese espejo podía driftear con la
 * autorización real del backend. Acá queda del lado del servidor: el endpoint
 * {@code GET /api/tenants/{id}/workspace} devuelve los módulos permitidos y el front
 * solo los dibuja. La autorización REAL de cada endpoint sigue siendo {@code @PreAuthorize}
 * / {@code requireRole}; esto es solo para la UI (no es un control de seguridad).</p>
 *
 * <p>Las claves de módulo son un contrato compartido con el registry del frontend
 * (cada item de navegación referencia una de estas claves).</p>
 */
public final class WorkspacePolicy {

    private WorkspacePolicy() {}

    /** Todas las claves de módulo conocidas (la unión de todos los verticales). */
    public static final Set<String> ALL_MODULES = Set.of(
            // Compartidos / gym
            "dashboard", "members", "payments", "classes", "access", "retention",
            "reports", "team", "settings", "lobby",
            // Kiosco
            "pos", "products", "inventory", "customers", "suppliers", "cash", "fiscal",
            // Canchas
            "courtGrid", "courtFixed", "courtCustomers", "courts"
    );

    /**
     * STAFF: operación diaria. Sin equipo ni analítica/finanzas, ni el catálogo/compras
     * del kiosco. (Espejo exacto de los blockedPaths que tenía el Sidebar.)
     */
    private static final Set<String> STAFF_BLOCKED = Set.of(
            "team", "dashboard", "payments", "retention", "reports",
            "products", "inventory", "suppliers", "fiscal"
    );

    /**
     * RECEPCIÓN: el mostrador. Acceso/check-in, la grilla y los clientes de canchas, el
     * POS y la caja del kiosco, ajustes y el cambio de sistema. (Espejo de allowedPaths.)
     */
    private static final Set<String> RECEPTION_ALLOWED = Set.of(
            "access", "settings", "lobby", "courtGrid", "courtCustomers", "pos", "cash"
    );

    /** Módulos que el rol puede VER en la navegación. */
    public static Set<String> modulesFor(UserRole role) {
        return switch (role) {
            case OWNER, ADMIN -> ALL_MODULES;
            case RECEPTION -> RECEPTION_ALLOWED;
            case STAFF -> {
                Set<String> allowed = new HashSet<>(ALL_MODULES);
                allowed.removeAll(STAFF_BLOCKED);
                yield allowed;
            }
        };
    }
}
