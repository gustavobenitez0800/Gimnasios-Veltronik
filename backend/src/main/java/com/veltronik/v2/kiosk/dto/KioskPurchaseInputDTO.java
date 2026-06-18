package com.veltronik.v2.kiosk.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Entrada para registrar una compra. Repone stock y actualiza costos. */
@Data
public class KioskPurchaseInputDTO {
    private UUID supplierId;        // opcional (compra suelta)
    private LocalDate purchaseDate; // opcional (default hoy)
    private String notes;

    @NotEmpty(message = "La compra necesita al menos un renglón")
    @Valid
    private List<KioskPurchaseItemInputDTO> items;
}
