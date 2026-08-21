package com.veltronik.v2.core.security;

import java.util.UUID;

/**
 * Quién está en el turno durante esta request.
 *
 * <p>Hermano de {@link DeviceContextHolder}: aquel dice desde qué MÁQUINA vino la
 * operación, este dice qué PERSONA la hizo. {@code TenantAwareEntity} estampa los dos al
 * insertar cualquier registro.</p>
 *
 * <p>ThreadLocal, como el resto del contexto de request. El filtro lo limpia siempre en un
 * {@code finally}: un hilo del pool que quede con el cajero de la request anterior firmaría
 * los movimientos de otra persona, que es peor que no firmarlos.</p>
 */
public class CashierContextHolder {

    private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();

    private CashierContextHolder() {}

    public static void setCashierId(UUID cashierId) {
        CURRENT.set(cashierId);
    }

    /** Null si nadie marcó turno (la web del dueño, un webhook, un job). */
    public static UUID getCashierId() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
