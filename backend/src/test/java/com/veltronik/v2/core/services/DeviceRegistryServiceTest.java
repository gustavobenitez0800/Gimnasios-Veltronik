package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.DeviceRole;
import com.veltronik.v2.core.entities.DeviceStatus;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.exceptions.DeviceEnrollConflictException;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.repositories.DeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

    // ── Enrolamiento (ladrillo 2, "el bautizo") ─────────────────────────────────

    private final UUID ownerId = UUID.randomUUID();

    @Test
    @DisplayName("el bautizo ata el equipo a la sucursal con rol, nombre y auditoría")
    void enroll_feliz() {
        when(repository.findById(deviceId)).thenReturn(Optional.empty());
        when(repository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        Device enrolled = service.enroll(deviceId, tenantId, ownerId, DeviceRole.CAJA, "Caja mostrador", false);

        assertThat(enrolled.getId()).isEqualTo(deviceId);
        assertThat(enrolled.getEnrolledTenantId()).isEqualTo(tenantId);
        assertThat(enrolled.getRole()).isEqualTo(DeviceRole.CAJA);
        assertThat(enrolled.getDisplayName()).isEqualTo("Caja mostrador");
        assertThat(enrolled.getStatus()).isEqualTo(DeviceStatus.ACTIVE);
        assertThat(enrolled.getEnrolledAt()).isNotNull();
        assertThat(enrolled.getEnrolledByUserId()).isEqualTo(ownerId);
        assertThat(enrolled.isEnrolledActiveIn(tenantId)).isTrue();
    }

    @Test
    @DisplayName("sin nombre o sin rol no hay bautizo (BusinessException)")
    void enroll_valida_entrada() {
        assertThatThrownBy(() -> service.enroll(deviceId, tenantId, ownerId, null, "Caja", false))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.enroll(deviceId, tenantId, ownerId, DeviceRole.CAJA, "  ", false))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("un encargado activo por sucursal: el segundo choca con 409 (conflicto)")
    void enroll_encargado_choca_si_ya_hay_uno_activo() {
        Device existingManager = new Device();
        existingManager.setId(UUID.randomUUID());
        existingManager.setEnrolledTenantId(tenantId);
        existingManager.setRole(DeviceRole.ENCARGADO);
        existingManager.setStatus(DeviceStatus.ACTIVE);
        when(repository.findByEnrolledTenantIdAndRoleAndStatus(tenantId, DeviceRole.ENCARGADO, DeviceStatus.ACTIVE))
                .thenReturn(List.of(existingManager));

        assertThatThrownBy(() -> service.enroll(deviceId, tenantId, ownerId, DeviceRole.ENCARGADO, "Caja Madre", false))
                .isInstanceOf(DeviceEnrollConflictException.class);
        verify(repository, never()).save(any(Device.class));
    }

    @Test
    @DisplayName("con reemplazo explícito, la Caja Madre anterior queda REVOKED y entra la nueva")
    void enroll_encargado_con_reemplazo_explicito() {
        Device existingManager = new Device();
        existingManager.setId(UUID.randomUUID());
        existingManager.setEnrolledTenantId(tenantId);
        existingManager.setRole(DeviceRole.ENCARGADO);
        existingManager.setStatus(DeviceStatus.ACTIVE);
        when(repository.findByEnrolledTenantIdAndRoleAndStatus(tenantId, DeviceRole.ENCARGADO, DeviceStatus.ACTIVE))
                .thenReturn(List.of(existingManager));
        when(repository.findById(deviceId)).thenReturn(Optional.empty());
        when(repository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        Device enrolled = service.enroll(deviceId, tenantId, ownerId, DeviceRole.ENCARGADO, "Caja Madre nueva", true);

        assertThat(existingManager.getStatus()).isEqualTo(DeviceStatus.REVOKED);
        assertThat(enrolled.getStatus()).isEqualTo(DeviceStatus.ACTIVE);
        assertThat(enrolled.getRole()).isEqualTo(DeviceRole.ENCARGADO);
    }

    @Test
    @DisplayName("re-enrolarse a sí mismo como encargado no cuenta como conflicto")
    void enroll_reenrolar_el_mismo_equipo_no_choca() {
        Device self = new Device();
        self.setId(deviceId);
        self.setEnrolledTenantId(tenantId);
        self.setRole(DeviceRole.ENCARGADO);
        self.setStatus(DeviceStatus.ACTIVE);
        when(repository.findByEnrolledTenantIdAndRoleAndStatus(tenantId, DeviceRole.ENCARGADO, DeviceStatus.ACTIVE))
                .thenReturn(List.of(self));
        when(repository.findById(deviceId)).thenReturn(Optional.of(self));
        when(repository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        Device enrolled = service.enroll(deviceId, tenantId, ownerId, DeviceRole.ENCARGADO, "Caja Madre", false);

        assertThat(enrolled.getStatus()).isEqualTo(DeviceStatus.ACTIVE);
    }

    @Test
    @DisplayName("revocar deja REVOKED sin borrar; un equipo de otra sucursal da 404")
    void revoke_y_aislamiento() {
        Device enrolled = new Device();
        enrolled.setId(deviceId);
        enrolled.setEnrolledTenantId(tenantId);
        enrolled.setStatus(DeviceStatus.ACTIVE);
        when(repository.findById(deviceId)).thenReturn(Optional.of(enrolled));
        when(repository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        service.revoke(deviceId, tenantId);
        assertThat(enrolled.getStatus()).isEqualTo(DeviceStatus.REVOKED);
        verify(repository, never()).delete(any(Device.class));

        // Equipo enrolado a OTRA sucursal: para este tenant no existe (no se filtra info).
        assertThatThrownBy(() -> service.revoke(deviceId, UUID.randomUUID()))
                .isInstanceOf(EntityNotFoundException.class);
    }
}
