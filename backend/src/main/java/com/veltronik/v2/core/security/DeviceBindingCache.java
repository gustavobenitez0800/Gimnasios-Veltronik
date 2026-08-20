package com.veltronik.v2.core.security;

import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Caché en memoria (TTL corto) de "¿a qué sucursal está atado este equipo?".
 *
 * <p>Mismo problema y misma forma que {@link MembershipCache}: el chequeo corre en
 * {@link TenantContextFilter} en CADA request, y sin caché sería una query contra
 * Supabase (cientos de ms de RTT entre regiones) antes de tocar el endpoint.</p>
 *
 * <p><b>Acá SÍ se cachean los negativos, al revés que MembershipCache — y la asimetría es
 * a propósito.</b> Allá el negativo es "no tiene acceso", y cachearlo demoraría un permiso
 * recién otorgado; acá el negativo es "este equipo no está enrolado", que es el caso de
 * TODOS los navegadores web. Sin cachearlo, cada request del portal pagaría una consulta
 * a la BD para enterarse de que no hay nada que hacer.</p>
 *
 * <p>El costo de cachear el negativo es que un equipo recién enrolado tarda hasta
 * {@value #TTL_MS}ms en quedar atado. Se anula con {@link #evict}, que llama el
 * enrolamiento: el efecto es inmediato en esta instancia.</p>
 */
@Component
public class DeviceBindingCache {

    /** Ventana máxima de obsolescencia tolerada (60 s), igual que MembershipCache. */
    private static final long TTL_MS = 60_000;

    /** Tope defensivo: si algo creciera sin control, se vacía y se vuelve a poblar. */
    private static final int MAX_ENTRIES = 10_000;

    /** {@code tenantId == null} significa "visto, y NO está atado a ninguna sucursal". */
    private record Entry(UUID tenantId, long expiresAtMs) {}

    private final ConcurrentHashMap<UUID, Entry> cache = new ConcurrentHashMap<>();

    /** Resultado de una consulta a la caché: distingue "no sé" de "sé que no está atado". */
    public record Binding(UUID tenantId) {
        public boolean isBound() {
            return tenantId != null;
        }
    }

    /**
     * Atadura cacheada del equipo.
     *
     * @return {@code null} si no hay entrada vigente (hay que ir a la BD); si no, el
     *         binding — que puede ser "no atado" ({@code tenantId == null}).
     */
    public Binding get(UUID deviceId) {
        if (deviceId == null) return null;
        Entry entry = cache.get(deviceId);
        if (entry == null) return null;
        if (System.currentTimeMillis() > entry.expiresAtMs()) {
            cache.remove(deviceId);
            return null;
        }
        return new Binding(entry.tenantId());
    }

    /**
     * Registra lo verificado contra la BD.
     *
     * @param enrolledTenantId sucursal de enrolamiento, o {@code null} si el equipo no
     *                         está enrolado y activo
     */
    public void put(UUID deviceId, UUID enrolledTenantId) {
        if (deviceId == null) return;
        if (cache.size() >= MAX_ENTRIES) {
            cache.clear();
        }
        cache.put(deviceId, new Entry(enrolledTenantId, System.currentTimeMillis() + TTL_MS));
    }

    /** Invalida la entrada (enrolar, re-enrolar, revocar) → efecto inmediato. */
    public void evict(UUID deviceId) {
        if (deviceId != null) cache.remove(deviceId);
    }
}
