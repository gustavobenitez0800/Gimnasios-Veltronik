package com.veltronik.v2.core.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Un equipo de la flota, para Mission Control (vista cross-tenant del fundador, ladrillo 7). */
@Data
public class FleetDeviceDTO {
    private UUID id;
    private String tenantName;
    private String displayName;
    private String role;         // CAJA | ENCARGADO
    private String status;       // ACTIVE | REVOKED
    private Short updateRing;    // 0=piloto, 1=amigos, 2=todos, null=todos
    private String lastAppVersion;
    private LocalDateTime lastSeenAt;
    private LocalDateTime lastSyncAt;
}
