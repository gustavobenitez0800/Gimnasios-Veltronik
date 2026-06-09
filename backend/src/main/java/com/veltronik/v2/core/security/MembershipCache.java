package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.UserRole;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Caché en memoria (TTL corto) del chequeo "¿el usuario es miembro ACTIVO del tenant y
 * con qué rol?". Ese chequeo corre en {@link TenantContextFilter} en CADA request: una
 * query extra contra Supabase (cientos de ms de RTT entre regiones) antes de empezar a
 * atender el endpoint. Con la caché, solo la primera request del minuto paga el viaje.
 *
 * <p><b>Seguridad — qué se cachea y qué no:</b></p>
 * <ul>
 *   <li>Solo se cachean resultados POSITIVOS (membresía activa + rol). Un usuario SIN
 *       acceso siempre golpea la BD → un acceso recién otorgado funciona al instante y
 *       nunca se "cachea" un rechazo obsoleto.</li>
 *   <li>Quitar a un miembro o cambiarle el rol tiene efecto inmediato en esta instancia
 *       vía {@link #evict} (lo invoca la gestión de equipo); el TTL de {@value #TTL_MS}ms
 *       acota la ventana en cualquier otro caso.</li>
 * </ul>
 */
@Component
public class MembershipCache {

    /** Ventana máxima de obsolescencia tolerada para rol/pertenencia (60 s). */
    private static final long TTL_MS = 60_000;
    /** Tope defensivo: si algo creciera sin control, se vacía y se vuelve a poblar. */
    private static final int MAX_ENTRIES = 10_000;

    private record Entry(UserRole role, long expiresAtMs) {}

    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

    /** Rol cacheado del usuario en el tenant, o null si no hay entrada vigente. */
    public UserRole getRole(UUID userId, UUID tenantId) {
        String key = key(userId, tenantId);
        Entry entry = cache.get(key);
        if (entry == null) return null;
        if (System.currentTimeMillis() > entry.expiresAtMs()) {
            cache.remove(key);
            return null;
        }
        return entry.role();
    }

    /** Registra una membresía ACTIVA verificada contra la BD. */
    public void put(UUID userId, UUID tenantId, UserRole role) {
        if (role == null) return;
        if (cache.size() >= MAX_ENTRIES) {
            cache.clear();
        }
        cache.put(key(userId, tenantId), new Entry(role, System.currentTimeMillis() + TTL_MS));
    }

    /** Invalida la entrada (cambio de rol, baja del equipo) → efecto inmediato. */
    public void evict(UUID userId, UUID tenantId) {
        cache.remove(key(userId, tenantId));
    }

    private String key(UUID userId, UUID tenantId) {
        return userId + ":" + tenantId;
    }
}
