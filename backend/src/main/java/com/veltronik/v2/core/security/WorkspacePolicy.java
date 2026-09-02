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

    /** Todas las claves de módulo conocidas (hoy solo gym + compartidos). */
    public static final Set<String> ALL_MODULES = Set.of(
            "dashboard", "members", "payments", "classes", "access", "retention",
            "reports", "team", "settings", "lobby", "caja", "adentro"
    );

    /**
     * STAFF: operación diaria. Sin equipo ni analítica/finanzas, ni analítica/finanzas. (Espejo exacto de los blockedPaths que tenía el Sidebar.)
     */
    private static final Set<String> STAFF_BLOCKED = Set.of(
            "team", "dashboard", "payments", "retention", "reports"
    );

    /**
     * RECEPCIÓN: el mostrador. Acceso/check-in, ajustes y el cambio de sistema. (Espejo de allowedPaths.)
     */
    private static final Set<String> RECEPTION_ALLOWED = Set.of(
            "access", "settings", "lobby",
            // "En el gimnasio" (quién está adentro ahora + el registro del día) es del
            // mostrador tanto como el check-in: es la pantalla que se mira cuando alguien
            // pregunta "¿está fulano?" o hay que cerrar y ver quién quedó sin marcar salida.
            // Sale del MISMO endpoint que ya usa recepción (/gym/access/mostrador), así que
            // no abre ningún dato nuevo: solo lo muestra en su propio lugar.
            "adentro",
            // El cierre de caja SÍ es de recepción: es quien tiene el cajón adelante y quien
            // cuenta la plata. Va aparte de "payments" a propósito — ese módulo abre el
            // listado de cobros y los ingresos del mes, que son del dueño. Meter el arqueo
            // ahí adentro dejaba la función inalcanzable justo para quien la usa.
            "caja"
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
