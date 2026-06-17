package com.veltronik.v2.kiosk.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class KioskSettingsDTO {
    private BigDecimal cardSurchargePct;
    private boolean allowFiado;
    private boolean autoInvoice;
    private boolean lowStockAlert;
}
