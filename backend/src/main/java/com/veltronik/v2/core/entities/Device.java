package com.veltronik.v2.core.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

    /**
     * Última vez que el equipo EMPUJÓ datos por sync (ladrillo 7). Señal honesta de
     * frescura ("los datos de esta caja están al día en la nube"), a diferencia de
     * {@link #lastSeenAt} que es el heartbeat de cualquier request.
     */
    @Column(name = "last_sync_at")
    private LocalDateTime lastSyncAt;

    /** Anillo de despliegue del rollout escalonado (ADR-007): 0=piloto, 1=amigos, 2=todos. Null=todos. */
    @Column(name = "update_ring")
    private Short updateRing;

    // ── Enrolamiento (ladrillo 2, "el bautizo") ─────────────────────────────────
    // La pertenencia FUERTE a una sucursal (a diferencia de lastTenantId = telemetría).
    // Todos nullables: un equipo puede vivir sin enrolarse (ej. el navegador del dueño).

    /** Sucursal a la que fue enrolado. Null = equipo anónimo (solo telemetría). */
    @Column(name = "enrolled_tenant_id")
    private UUID enrolledTenantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", length = 20)
    private DeviceRole role;

    /** Nombre visible que le puso el dueño ("Caja mostrador"). */
    @Column(name = "display_name", length = 120)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20)
    private DeviceStatus status;

    @Column(name = "enrolled_at")
    private LocalDateTime enrolledAt;

    /** Quién lo bautizó (auditoría). */
    @Column(name = "enrolled_by_user_id")
    private UUID enrolledByUserId;

    /**
     * Hash SHA-256 (hex) de la credencial de equipo emitida al enrolar (ladrillo 4).
     * El secreto en claro viaja UNA sola vez al equipo; acá solo vive su hash.
     * El sync headless autentica con X-Device-Id + X-Device-Key contra esto.
     */
    @Column(name = "credential_hash", length = 64)
    private String credentialHash;

    /** ¿Está enrolado y activo en la sucursal dada? */
    public boolean isEnrolledActiveIn(UUID tenantId) {
        return tenantId != null
                && tenantId.equals(enrolledTenantId)
                && status == DeviceStatus.ACTIVE;
    }
}
