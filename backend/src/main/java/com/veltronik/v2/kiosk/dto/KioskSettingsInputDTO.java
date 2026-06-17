package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;

/** Patch parcial de la configuración del vertical: solo pisa lo que vino. */
@Data
public class KioskSettingsInputDTO {
    private BigDecimal cardSurchargePct;
    private Boolean allowFiado;
    private Boolean autoInvoice;
    private Boolean lowStockAlert;
}
