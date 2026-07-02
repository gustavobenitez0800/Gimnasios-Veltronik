package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Registro de equipos (Fase 1, ladrillo 1 — ver docs/FASE1-PLAN.md).
 *
 * <p>Una fila por instalación física conocida. <b>El id de la fila ES el DNI del equipo</b>
 * (el UUID que el dispositivo genera y manda en {@code X-Device-Id}): primer uso real del
 * generador pre-asignable ({@link AssignableUuidGenerator}).</p>
 *
 * <p><b>Por qué NO es {@link TenantAwareEntity}:</b> un mismo equipo físico puede tocar
 * varios tenants (la notebook del dueño cambia de organización en el Lobby). Acá se guarda
 * la <i>última</i> sucursal vista como telemetría; la pertenencia fuerte (rol, nombre,
 * credencial) llega con el enrolamiento — ladrillo 2, columnas aditivas nuevas.</p>
 *
 * <p>Los campos de {@link BaseEntity}: {@code createdAt} = primera vez visto.</p>
 */
@Getter
@Setter
@Entity
@Table(name = "device_registry")
public class Device extends BaseEntity {

    /** Última sucursal (tenant) con la que operó, ya validada por TenantContextFilter. Sin FK dura: telemetría. */
    @Column(name = "last_tenant_id")
    private UUID lastTenantId;

    /** Versión de la app que corría en la última señal de vida (header X-App-Version). */
    @Column(name = "last_app_version", length = 32)
    private String lastAppVersion;

    /** Última señal de vida (throttleada: se persiste como mucho cada 5 minutos). */
    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;
}
