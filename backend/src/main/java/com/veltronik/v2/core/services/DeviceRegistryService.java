package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.DeviceRole;
import com.veltronik.v2.core.entities.DeviceStatus;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.exceptions.DeviceEnrollConflictException;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.repositories.DeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Señal de vida de los equipos (Fase 1, ladrillo 1 — docs/FASE1-PLAN.md).
 *
 * <p><b>Throttle:</b> se persiste como mucho una vez cada {@link #HEARTBEAT_INTERVAL} por
 * equipo (cache en memoria, igual filosofía que {@code MembershipCache}); jamás una escritura
 * por request. El mapa crece con la cantidad de equipos vivos (cientos) — acotado.</p>
 *
 * <p><b>La telemetría nunca rompe una operación:</b> todo error se loguea y se traga.
 * Un fallo del registro no puede afectar una venta (ADR-003).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceRegistryService {

    private static final Duration HEARTBEAT_INTERVAL = Duration.ofMinutes(5);

    private final DeviceRepository deviceRepository;

    /** Última persistencia por equipo (throttle en memoria; se resetea al redeployar — inofensivo). */
    private final Map<UUID, Instant> lastPersisted = new ConcurrentHashMap<>();

    /**
     * Registra que el equipo dio señales de vida. Crea la fila la primera vez (el id de la
     * fila ES el DNI: usa el generador pre-asignable de la Fase 0).
     *
     * @param deviceId   DNI del equipo (no nulo — el caller ya filtró)
     * @param tenantId   sucursal VALIDADA de la request (puede ser null: ej. Lobby sin org)
     * @param appVersion contenido de X-App-Version (puede ser null)
     */
    public void heartbeat(UUID deviceId, UUID tenantId, String appVersion) {
        final Instant now = Instant.now();
        final Instant previous = lastPersisted.get(deviceId);
        if (previous != null && Duration.between(previous, now).compareTo(HEARTBEAT_INTERVAL) < 0) {
            return; // dentro de la ventana: nada que escribir
        }
        lastPersisted.put(deviceId, now);

        try {
            Device device = deviceRepository.findById(deviceId).orElseGet(() -> {
                Device fresh = new Device();
                fresh.setId(deviceId); // el DNI viene del dispositivo; AssignableUuidGenerator lo respeta
                return fresh;
            });
            if (tenantId != null) device.setLastTenantId(tenantId);
            if (appVersion != null && !appVersion.isBlank()) {
                device.setLastAppVersion(appVersion.trim().substring(0, Math.min(32, appVersion.trim().length())));
            }
            device.setLastSeenAt(LocalDateTime.now());
            deviceRepository.save(device);
        } catch (Exception e) {
            // Carrera de primer-insert concurrente u otro fallo: se reintenta en la próxima ventana.
            log.warn("Heartbeat del equipo {} no se pudo persistir: {}", deviceId, e.getMessage());
        }
    }

    /** Equipos de la sucursal (enrolados a ella o vistos operándola), para el listado del dueño. */
    public List<Device> devicesOf(UUID tenantId) {
        return deviceRepository.findByEnrolledTenantIdOrLastTenantIdOrderByLastSeenAtDesc(tenantId, tenantId);
    }

    /** Estado del equipo que llama (para que el instalable decida si mostrar el bautizo). */
    public Optional<Device> findDevice(UUID deviceId) {
        return deviceRepository.findById(deviceId);
    }

    // ── Enrolamiento: el "bautizo" (ladrillo 2, diseño en docs/FASE1-PLAN.md) ──────

    /**
     * Enrola el equipo a la sucursal: pertenencia fuerte, con rol y nombre visible.
     * El equipo no se crea acá si ya dio señales de vida — se lo <b>reclama</b>.
     *
     * <p><b>Integridad:</b> una sucursal admite UN solo {@link DeviceRole#ENCARGADO} ACTIVO.
     * Si ya hay otro, lanza {@link DeviceEnrollConflictException} (HTTP 409) salvo que se
     * pida el reemplazo explícito — nunca se pisa una Caja Madre en silencio.</p>
     *
     * <p>Re-enrolar (cambiar de sucursal, rol o nombre) es legal por diseño: la sucursal es
     * una etiqueta reasignable; el DNI y su historial no cambian (ADR-002).</p>
     */
    @Transactional
    public Device enroll(UUID deviceId, UUID tenantId, UUID enrolledByUserId,
                         DeviceRole role, String displayName, boolean replaceActiveManager) {
        if (role == null) throw new BusinessException("Elegí el rol del equipo (CAJA o ENCARGADO).");
        if (displayName == null || displayName.isBlank())
            throw new BusinessException("Poné un nombre visible para el equipo (ej: Caja mostrador).");

        if (role == DeviceRole.ENCARGADO) {
            Optional<Device> conflict = deviceRepository
                    .findByEnrolledTenantIdAndRoleAndStatus(tenantId, DeviceRole.ENCARGADO, DeviceStatus.ACTIVE)
                    .stream().filter(d -> !d.getId().equals(deviceId)).findFirst();
            if (conflict.isPresent()) {
                if (!replaceActiveManager) throw new DeviceEnrollConflictException(conflict.get());
                Device old = conflict.get();
                old.setStatus(DeviceStatus.REVOKED);
                deviceRepository.save(old);
                log.info("Caja Madre {} de la sucursal {} revocada por reemplazo (nuevo encargado: {})",
                        old.getId(), tenantId, deviceId);
            }
        }

        Device device = deviceRepository.findById(deviceId).orElseGet(() -> {
            Device fresh = new Device();
            fresh.setId(deviceId);
            fresh.setLastSeenAt(LocalDateTime.now());
            return fresh;
        });
        device.setEnrolledTenantId(tenantId);
        device.setRole(role);
        device.setDisplayName(displayName.trim().substring(0, Math.min(120, displayName.trim().length())));
        device.setStatus(DeviceStatus.ACTIVE);
        device.setEnrolledAt(LocalDateTime.now());
        device.setEnrolledByUserId(enrolledByUserId);
        return deviceRepository.save(device);
    }

    /**
     * Revoca el enrolamiento de un equipo de la sucursal. Nunca borra: el DNI y su
     * historial quedan (los datos históricos siguen apuntando a él por origin_device_id).
     */
    @Transactional
    public void revoke(UUID deviceId, UUID tenantId) {
        Device device = deviceRepository.findById(deviceId)
                .filter(d -> tenantId.equals(d.getEnrolledTenantId()))
                .orElseThrow(() -> new EntityNotFoundException("equipo de esta sucursal", deviceId));
        device.setStatus(DeviceStatus.REVOKED);
        deviceRepository.save(device);
    }
}
