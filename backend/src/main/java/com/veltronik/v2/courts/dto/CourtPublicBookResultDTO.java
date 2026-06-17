package com.veltronik.v2.courts.dto;

import lombok.Data;

import java.math.BigDecimal;

/** Resultado de una reserva online: queda esperando seña; se le explica al cliente cómo pagarla. */
@Data
public class CourtPublicBookResultDTO {
    private String bookingId;
    private String court;
    private String date;
    private String startTime;
    private String endTime;
    private BigDecimal depositAmount;
    private String paymentAlias;
    private String whatsappNumber;
    private int expiresInMinutes;
}
