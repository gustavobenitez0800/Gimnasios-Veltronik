package com.veltronik.v2.core.entities;

/**
 * Estado del enrolamiento de un equipo (Fase 1, ladrillo 2).
 * Revocar NUNCA borra la fila: el DNI y su historial quedan para siempre (ADR-002).
 */
public enum DeviceStatus {
    ACTIVE,
    REVOKED
}
