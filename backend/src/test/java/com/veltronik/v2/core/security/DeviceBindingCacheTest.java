package com.veltronik.v2.core.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La caché que sostiene la atadura equipo→sucursal (Fase 3).
 *
 * <p>Lo que se prueba acá no es "guarda y devuelve", sino la distinción de la que depende
 * la corrección del filtro: <b>"no sé nada de este equipo"</b> (hay que ir a la BD) tiene
 * que ser distinguible de <b>"sé que este equipo NO está atado"</b> (no hay nada que
 * verificar). Si las dos cosas se confundieran en un null, o bien todo navegador web
 * pagaría una consulta por request, o bien un equipo atado se colaría sin chequeo.</p>
 */
class DeviceBindingCacheTest {

    private final DeviceBindingCache cache = new DeviceBindingCache();

    @Test
    @DisplayName("Sin entrada devuelve null: el filtro debe ir a la base")
    void sinEntradaDevuelveNull() {
        assertThat(cache.get(UUID.randomUUID())).isNull();
    }

    @Test
    @DisplayName("Equipo atado: devuelve su sucursal")
    void equipoAtado() {
        UUID device = UUID.randomUUID();
        UUID tenant = UUID.randomUUID();

        cache.put(device, tenant);

        DeviceBindingCache.Binding binding = cache.get(device);
        assertThat(binding).isNotNull();
        assertThat(binding.isBound()).isTrue();
        assertThat(binding.tenantId()).isEqualTo(tenant);
    }

    @Test
    @DisplayName("Equipo SIN enrolar: se cachea el negativo y se distingue de 'no sé'")
    void negativoSeCacheaYSeDistingue() {
        UUID device = UUID.randomUUID();

        cache.put(device, null);

        DeviceBindingCache.Binding binding = cache.get(device);
        // No es null (o sea: NO hay que volver a la base — este es el caso de todo
        // navegador web, y es el que hace que la caché valga la pena)...
        assertThat(binding).isNotNull();
        // ...pero tampoco está atado, así que el filtro no tiene nada que verificar.
        assertThat(binding.isBound()).isFalse();
        assertThat(binding.tenantId()).isNull();
    }

    @Test
    @DisplayName("evict borra la entrada: enrolar y revocar tienen efecto inmediato")
    void evictBorraLaEntrada() {
        UUID device = UUID.randomUUID();
        cache.put(device, UUID.randomUUID());
        assertThat(cache.get(device)).isNotNull();

        cache.evict(device);

        assertThat(cache.get(device)).isNull();
    }

    @Test
    @DisplayName("Un deviceId nulo nunca rompe ni ensucia la caché")
    void deviceIdNuloEsInofensivo() {
        assertThat(cache.get(null)).isNull();
        cache.put(null, UUID.randomUUID());   // no debe explotar
        cache.evict(null);                    // tampoco
        assertThat(cache.get(null)).isNull();
    }
}
