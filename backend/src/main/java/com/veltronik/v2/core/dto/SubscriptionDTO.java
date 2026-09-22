package com.veltronik.v2.core.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class SubscriptionDTO {
    private UUID id;
    private UUID tenantId;
    private String status;
    /**
     * BASICO o PREMIUM. Solo de salida: el Lobby lo necesita para mostrar el precio de CADA
     * sucursal (antes decía el del básico en todas). El mapper lo ignora al entrar: un cliente
     * no se puede cambiar el plan mandando un JSON.
     */
    private String planCode;
    private LocalDateTime currentPeriodStart;
    private LocalDateTime currentPeriodEnd;
    private LocalDateTime gracePeriodEndsAt;
    private String mpPayerEmail;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
