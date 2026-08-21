package com.veltronik.v2.core.security;

import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Caché de "¿este cajero existe, está activo y es de esta sucursal?".
 *
 * <p>Mismo problema y misma forma que {@link MembershipCache} y {@link DeviceBindingCache}:
 * el chequeo corre en cada request que venga de un mostrador con turno abierto, y sin
 * caché sería una consulta contra Supabase antes de atender el endpoint.</p>
 *
 * <p>Se cachean los dos veredictos, positivo y negativo. El negativo es el caso de todo
 * navegador del dueño y de cualquier request sin turno: preguntarlo cada vez sería pagar
 * un viaje para enterarse de que no hay nada que firmar. La contrapartida es que dar de
 * baja a alguien tarda hasta {@value #TTL_MS}ms en cortarle la firma, y por eso el alta y
 * la baja llaman a {@link #evict}.</p>
 */
@Component
public class CashierContextCache {

    /** Ventana de obsolescencia tolerada (60 s), igual que sus hermanas. */
    private static final long TTL_MS = 60_000;
    private static final int MAX_ENTRIES = 10_000;

    private record Entry(boolean valid, long expiresAtMs) {}

    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

    /** @return null si no hay entrada vigente (hay que ir a la base). */
    public Boolean get(UUID cashierId, UUID tenantId) {
        Entry entry = cache.get(key(cashierId, tenantId));
        if (entry == null) return null;
        if (System.currentTimeMillis() > entry.expiresAtMs()) {
            cache.remove(key(cashierId, tenantId));
            return null;
        }
        return entry.valid();
    }

    public void put(UUID cashierId, UUID tenantId, boolean valid) {
        if (cache.size() >= MAX_ENTRIES) cache.clear();
        cache.put(key(cashierId, tenantId), new Entry(valid, System.currentTimeMillis() + TTL_MS));
    }

    /** Invalida al dar de alta, renombrar, cambiar el PIN o desactivar → efecto inmediato. */
    public void evict(UUID cashierId, UUID tenantId) {
        cache.remove(key(cashierId, tenantId));
    }

    private String key(UUID cashierId, UUID tenantId) {
        return cashierId + ":" + tenantId;
    }
}
