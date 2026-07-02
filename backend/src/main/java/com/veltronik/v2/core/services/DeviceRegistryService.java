package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.repositories.DeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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

    /** Equipos vistos operando la sucursal, para el listado del dueño (semilla de Mission Control). */
    public List<Device> devicesOf(UUID tenantId) {
        return deviceRepository.findByLastTenantIdOrderByLastSeenAtDesc(tenantId);
    }
}
