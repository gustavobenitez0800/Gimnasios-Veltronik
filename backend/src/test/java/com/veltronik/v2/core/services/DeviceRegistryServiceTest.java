package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.repositories.DeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Señal de vida de equipos (Fase 1, ladrillo 1): throttle, alta con id pre-asignado
 * (el DNI), y la regla de oro — la telemetría jamás rompe una operación.
 */
class DeviceRegistryServiceTest {

    private DeviceRepository repository;
    private DeviceRegistryService service;

    private final UUID deviceId = UUID.randomUUID();
    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repository = mock(DeviceRepository.class);
        service = new DeviceRegistryService(repository);
    }

    @Test
    @DisplayName("primer heartbeat crea la fila con el DNI como id")
    void primer_heartbeat_crea_el_equipo() {
        when(repository.findById(deviceId)).thenReturn(Optional.empty());

        service.heartbeat(deviceId, tenantId, "2.6.4");

        ArgumentCaptor<Device> saved = ArgumentCaptor.forClass(Device.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(deviceId);
        assertThat(saved.getValue().getLastTenantId()).isEqualTo(tenantId);
        assertThat(saved.getValue().getLastAppVersion()).isEqualTo("2.6.4");
        assertThat(saved.getValue().getLastSeenAt()).isNotNull();
    }

    @Test
    @DisplayName("dentro de la ventana de 5 minutos NO se vuelve a persistir")
    void throttle_evita_escrituras_repetidas() {
        when(repository.findById(deviceId)).thenReturn(Optional.empty());

        service.heartbeat(deviceId, tenantId, "2.6.4");
        service.heartbeat(deviceId, tenantId, "2.6.4");
        service.heartbeat(deviceId, tenantId, "2.6.4");

        verify(repository, times(1)).save(any(Device.class));
    }

    @Test
    @DisplayName("equipos distintos no comparten throttle")
    void throttle_es_por_equipo() {
        when(repository.findById(any(UUID.class))).thenReturn(Optional.empty());

        service.heartbeat(deviceId, tenantId, null);
        service.heartbeat(UUID.randomUUID(), tenantId, null);

        verify(repository, times(2)).save(any(Device.class));
    }

    @Test
    @DisplayName("tenant nulo (ej. Lobby sin org) no pisa la última sucursal conocida")
    void tenant_nulo_no_pisa_el_anterior() {
        Device existing = new Device();
        existing.setId(deviceId);
        existing.setLastTenantId(tenantId);
        when(repository.findById(deviceId)).thenReturn(Optional.of(existing));

        service.heartbeat(deviceId, null, "2.6.4");

        ArgumentCaptor<Device> saved = ArgumentCaptor.forClass(Device.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getLastTenantId()).isEqualTo(tenantId);
    }

    @Test
    @DisplayName("una versión absurdamente larga se trunca a 32 (no rompe la columna)")
    void version_larga_se_trunca() {
        when(repository.findById(deviceId)).thenReturn(Optional.empty());

        service.heartbeat(deviceId, tenantId, "x".repeat(100));

        ArgumentCaptor<Device> saved = ArgumentCaptor.forClass(Device.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getLastAppVersion()).hasSize(32);
    }

    @Test
    @DisplayName("si la persistencia explota, el heartbeat lo traga (jamás rompe la request)")
    void error_de_persistencia_no_propaga() {
        when(repository.findById(deviceId)).thenReturn(Optional.empty());
        when(repository.save(any(Device.class))).thenThrow(new RuntimeException("boom"));

        service.heartbeat(deviceId, tenantId, "2.6.4"); // no debe lanzar
    }
}
