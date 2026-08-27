package com.veltronik.v2.core.config;

/**
 * Los planes que existen. El código es lo que se guarda en {@code subscriptions.plan_code}.
 *
 * <p><b>Regla:</b> nunca borrar ni renombrar un valor de este enum. Una suscripción vieja
 * guarda su código en la base; si el valor desaparece, esa fila deja de poder leerse. Un plan
 * que se discontinúa se saca del catálogo ({@code available = false}), no del enum.</p>
 */
public enum PlanCode {

    /** El sistema completo de gestión. Es el único que se ofrece hoy. */
    BASICO,

    /** Básico + control de acceso con molinetes. En construcción: todavía NO se ofrece. */
    PREMIUM;

    /** Convierte el texto guardado en la base a un plan; lo desconocido cae en BÁSICO. */
    public static PlanCode from(String raw) {
        if (raw == null || raw.isBlank()) return BASICO;
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            // Una fila con un código que este build no conoce (downgrade, dato viejo) no puede
            // tumbar la lectura: se trata como básico, que es el piso de lo contratado.
            return BASICO;
        }
    }
}
