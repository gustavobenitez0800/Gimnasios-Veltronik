package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/** Contrato de SALIDA de la configuración del vertical de canchas. */
@Data
public class CourtSettingsDTO {
    private UUID id;
    private int slotDurationMinutes;
    private LocalTime openingTime;
    private LocalTime closingTime;
    private BigDecimal defaultPrice;
    private BigDecimal depositAmount;
    private int depositTimeoutMinutes;
    private String paymentAlias;

    // ─── Bot de WhatsApp (el token NUNCA se expone; solo si está configurado) ───
    private boolean botEnabled;
    private String waPhoneNumberId;
    private String botInstructions;
    private boolean waConfigured;
}
