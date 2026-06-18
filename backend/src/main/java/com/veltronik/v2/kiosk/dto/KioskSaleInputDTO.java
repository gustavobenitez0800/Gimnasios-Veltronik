package com.veltronik.v2.kiosk.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Entrada para registrar una venta. {@code clientUuid} lo genera el cliente (POS) y es la
 * llave de idempotencia: reenviar la misma venta NO la duplica.
 *
 * <p>El backend es la autoridad sobre los precios (Mandamiento #4): toma los precios de los
 * productos, NO del cliente. El cliente solo manda producto + cantidad + cómo se pagó.</p>
 */
@Data
public class KioskSaleInputDTO {
    @NotNull(message = "El clientUuid (idempotencia) es obligatorio")
    private UUID clientUuid;

    /** Cliente de cuenta corriente: obligatorio solo si algún pago es CUENTA_CORRIENTE (fiado). */
    private UUID customerId;

    private String notes;

    @NotEmpty(message = "La venta necesita al menos un renglón")
    @Valid
    private List<KioskSaleItemInputDTO> items;

    @NotEmpty(message = "La venta necesita al menos un pago")
    @Valid
    private List<KioskSalePaymentInputDTO> payments;
}
